const axios = require('axios')
const { StringDecoder } = require('string_decoder')
const log = require('../common/log')
const defaultSettings = require('../common/config-default')
const { createProxyAgent } = require('./proxy-agent')
const { getAIProtocol, buildAIRequest, parseAIResponse } = require('./ai-protocol')

// Store for ongoing streaming sessions
const streamingSessions = new Map()
const pendingRequests = new Map()

// 2026-09-08 coder(lq): Cancel only the provider request owned by this run, including non-streaming tool and verification calls.
exports.cancelAIRequest = (requestId) => {
  const controller = pendingRequests.get(requestId)
  controller?.abort()
  return { cancelled: Boolean(controller) }
}
const TRANSIENT_AI_STATUSES = new Set([500, 502, 503, 504])
const AI_RETRY_DELAY_MS = 350

function isOptionalToolControlRejection (error, tools) {
  const status = error?.response?.status
  const reason = getProviderErrorMessage(error)
  return Boolean(tools?.length) && [400, 422].includes(status) &&
    /tool_choice|parallel_tool_calls/i.test(reason) &&
    /unsupported|not supported|unknown|unrecognized|not permitted|not allowed/i.test(reason)
}

function isStreamingUnsupported (error) {
  const status = error?.response?.status
  const reason = getProviderErrorMessage(error)
  return [400, 415, 422].includes(status) &&
    /stream|streaming/i.test(reason) &&
    /unsupported|not supported|unknown|unrecognized|not permitted|not allowed|invalid/i.test(reason)
}

function getProviderErrorMessage (error) {
  let data = error?.response?.data
  if (typeof data === 'string' && data.trim()) {
    try { data = JSON.parse(data) } catch { return data.trim().slice(0, 500) }
  }
  const message = data?.error?.message || data?.message
  return typeof message === 'string' ? message.trim().slice(0, 500) : ''
}

// 2026-09-09 coder(lq): Axios returns an error stream for streaming HTTP failures; read a bounded body without logging request headers or keys.
async function readProviderErrorBody (error) {
  const body = error?.response?.data
  if (!body || typeof body.on !== 'function') return
  error.response.data = await new Promise(resolve => {
    const chunks = []
    let size = 0
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(Buffer.concat(chunks).toString('utf8'))
      body.destroy()
    }
    const timer = setTimeout(finish, 2000)
    body.on('data', chunk => {
      const bytes = Buffer.from(chunk)
      chunks.push(bytes.subarray(0, Math.max(0, 16384 - size)))
      size += bytes.length
      if (size >= 16384) finish()
    })
    body.on('end', finish)
    body.on('error', finish)
    body.on('close', finish)
  })
}

function waitBeforeAIRequestRetry () {
  return new Promise(resolve => setTimeout(resolve, AI_RETRY_DELAY_MS))
}

// 2026-09-01 coder(lq): Retry only transient provider failures; terminal tools are invoked by the client after a response, so this never repeats a terminal command.
async function postAIRequest (client, path, requestData, options) {
  let retryCount = 0
  while (true) {
    try {
      return await client.post(path, requestData, options)
    } catch (error) {
      await readProviderErrorBody(error)
      const status = error?.response?.status
      if (!TRANSIENT_AI_STATUSES.has(status) || retryCount >= 1) {
        error.aiStatus = status || null
        error.aiRetryCount = retryCount
        error.aiProviderMessage = getProviderErrorMessage(error)
        throw error
      }
      retryCount += 1
      await waitBeforeAIRequestRetry()
    }
  }
}

exports.formatAIProviderError = (error, apiKey) => {
  const redact = value => {
    const text = String(value || '')
    return apiKey ? text.split(apiKey).join('[已隐藏密钥]') : text
  }
  const status = error?.aiStatus || error?.response?.status || null
  const providerMessage = redact(error?.aiProviderMessage || getProviderErrorMessage(error))
  return {
    message: providerMessage ? `AI 请求失败${status ? `（HTTP ${status}）` : ''}：${providerMessage}` : redact(error?.message || 'AI 请求失败'),
    status,
    retryCount: error?.aiRetryCount || 0,
    providerMessage
  }
}

// Stop an ongoing streaming session
exports.stopStream = (sessionId) => {
  const session = streamingSessions.get(sessionId)
  if (!session) {
    return { error: 'Session not found' }
  }

  // Destroy the stream to stop receiving data
  if (session.stream && !session.stream.destroyed) {
    session.stream.destroy()
  }

  // Mark as completed (not an error, just stopped by user)
  session.completed = true
  session.stopped = true

  // Clean up
  streamingSessions.delete(sessionId)

  return { stopped: true }
}

const createAIClient = (baseURL, apiKey, proxy, authHeaderName) => {
  const headerStr = authHeaderName || 'Authorization: Bearer'
  const parts = headerStr.split(': ')
  const headerKey = parts[0]
  const headerPrefix = parts.length > 1 ? parts[1] : ''
  const headerValue = headerPrefix
    ? `${headerPrefix} ${apiKey}`
    : apiKey
  const config = {
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      [headerKey]: headerValue
    }
  }

  // Add proxy agent if proxy is provided
  const agent = proxy ? createProxyAgent(proxy) : null
  if (agent) {
    config.httpsAgent = agent
    config.proxy = false // Disable default proxy behavior when using agent
  }

  return axios.create(config)
}

exports.AIchatWithTools = async (messages, model, baseURL, path, apiKey, proxy, tools, authHeaderName, reasoningEffort, toolChoice, requestId, stream = false) => {
  const controller = new AbortController()
  const startedAt = Date.now()
  const diagnostics = { toolCount: tools?.length || 0, controlsFallback: false, streaming: Boolean(stream), streamingFallback: false }
  if (requestId) pendingRequests.set(requestId, controller)
  try {
    const client = createAIClient(baseURL, apiKey, proxy, authHeaderName)
    const protocol = getAIProtocol(client.getUri({ url: path }))
    diagnostics.protocol = protocol
    const requestData = buildAIRequest({ model, messages, stream: Boolean(stream), tools, toolChoice, reasoningEffort }, protocol)
    const send = async useStream => {
      const options = { signal: controller.signal, ...(useStream ? { responseType: 'stream' } : {}) }
      try {
        return await postAIRequest(client, path, requestData, options)
      } catch (error) {
        if (!isOptionalToolControlRejection(error, tools)) throw error
        // 2026-08-31 coder(lq): Only remove optional tool controls for explicit schema rejection; auth and persistent server errors still surface to the agent.
        delete requestData.tool_choice
        delete requestData.parallel_tool_calls
        diagnostics.controlsFallback = true
        return postAIRequest(client, path, requestData, options)
      }
    }
    let response
    try {
      response = await send(Boolean(stream))
    } catch (error) {
      if (!stream || !isStreamingUnsupported(error)) throw error
      // 2026-09-09 coder(lq): Compatible gateways may reject SSE; downgrade only after an explicit streaming capability error.
      requestData.stream = false
      diagnostics.streaming = false
      diagnostics.streamingFallback = true
      response = await send(false)
    }
    if (requestData.stream) {
      const sessionId = Date.now().toString() + Math.random().toString(36).slice(2, 11)
      const sessionData = {
        stream: response.data,
        content: '',
        completed: false,
        error: null,
        protocol,
        apiKey,
        diagnostics: { ...diagnostics, httpStatus: response.status, durationMs: Date.now() - startedAt }
      }
      streamingSessions.set(sessionId, sessionData)
      processStream(sessionId, sessionData)
      return { sessionId, isStream: true, hasMore: true, content: '', diagnostics: sessionData.diagnostics }
    }
    // 2026-09-09 coder(lq): Metadata explains silent tool-control downgrades without recording prompts, outputs, keys or endpoint addresses.
    return { ...parseAIResponse(response.data, protocol), diagnostics: { ...diagnostics, httpStatus: response.status, durationMs: Date.now() - startedAt } }
  } catch (e) {
    if (controller.signal.aborted) return { error: 'AI request cancelled', cancelled: true }
    const details = exports.formatAIProviderError(e, apiKey)
    log.error('AI chat with tools error', details.message)
    return { error: details.message, status: details.status, retryCount: details.retryCount, providerMessage: details.providerMessage, diagnostics: { ...diagnostics, httpStatus: details.status, durationMs: Date.now() - startedAt } }
  } finally {
    if (requestId) pendingRequests.delete(requestId)
  }
}

exports.AIchat = async (
  prompt,
  model = defaultSettings.modelAI,
  role = defaultSettings.roleAI,
  baseURL = defaultSettings.baseURLAI,
  path = defaultSettings.apiPathAI,
  apiKey,
  proxy = defaultSettings.proxyAI,
  stream = true,
  authHeaderName = defaultSettings.authHeaderNameAI,
  reasoningEffort = defaultSettings.reasoningEffortAI
) => {
  try {
    const client = createAIClient(baseURL, apiKey, proxy, authHeaderName)
    const protocol = getAIProtocol(client.getUri({ url: path }))

    // Determine if we should use streaming based on the prompt content
    // Command suggestions should not use streaming for quick response
    const isCommandSuggestion = prompt.includes('give me max 5 command suggestions')
    const useStream = stream && !isCommandSuggestion

    const requestData = buildAIRequest({
      model,
      messages: [
        {
          role: 'system',
          content: role
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: useStream,
      reasoningEffort
    }, protocol)

    if (useStream) {
      // For streaming responses, initiate streaming and return session info
      const response = await postAIRequest(client, path, requestData, {
        responseType: 'stream'
      })

      const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
      const sessionData = {
        stream: response.data,
        content: '',
        completed: false,
        error: null,
        protocol,
        apiKey
      }

      streamingSessions.set(sessionId, sessionData)

      // Start processing the stream
      processStream(sessionId, sessionData)

      return {
        sessionId,
        isStream: true,
        hasMore: true,
        content: ''
      }
    } else {
      // For non-streaming responses (command suggestions and when stream=false)
      const response = await postAIRequest(client, path, requestData)

      const { message } = parseAIResponse(response.data, protocol)
      return {
        response: message.content,
        isStream: false
      }
    }
  } catch (e) {
    const details = exports.formatAIProviderError(e, apiKey)
    log.error('AI chat error', details.message)
    return { error: details.message, status: details.status, retryCount: details.retryCount, providerMessage: details.providerMessage }
  }
}

// Function to get the current state of a streaming session
exports.getStreamContent = (sessionId) => {
  const session = streamingSessions.get(sessionId)
  if (!session) {
    return {
      error: 'Session not found'
    }
  }

  const result = {
    content: session.content,
    hasMore: !session.completed,
    isStream: true,
    diagnostics: session.diagnostics
  }

  if (session.message) result.message = session.message
  if (session.finishReason !== undefined) result.finishReason = session.finishReason

  if (session.error) {
    result.error = session.error
  }

  // Clean up completed sessions
  if (session.completed || session.error) {
    streamingSessions.delete(sessionId)
  }

  return result
}

// Process streaming data
function processStream (sessionId, sessionData) {
  let buffer = ''
  const decoder = new StringDecoder('utf8')
  let eventLines = []
  const chatToolCalls = new Map()

  const finalizeChat = () => {
    const toolCalls = [...chatToolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => call)
    sessionData.message = {
      role: 'assistant',
      content: sessionData.content,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {})
    }
    sessionData.completed = true
  }

  const fail = error => {
    sessionData.error = exports.formatAIProviderError(error, sessionData.apiKey).message
    sessionData.completed = true
  }

  const processEvent = () => {
    const payload = eventLines.join('\n')
    eventLines = []
    if (!payload || sessionData.completed) return
    if (payload === '[DONE]') {
      if (sessionData.protocol !== 'responses') finalizeChat()
      return
    }
    try {
      const data = JSON.parse(payload)
      if (data.error || data.type === 'error') throw new Error(data.error?.message || data.message || 'AI 流式请求失败')
      if (sessionData.protocol === 'responses') {
        if (data.type === 'response.output_text.delta' || data.type === 'response.refusal.delta') {
          sessionData.content += data.delta || ''
        } else if (['response.completed', 'response.failed', 'response.incomplete'].includes(data.type)) {
          const { message, finishReason } = parseAIResponse(data.response, 'responses')
          // 2026-09-09 coder(lq): The completed response is authoritative; replacing avoids repeating delta text and catches incomplete tool calls.
          sessionData.content = message.content
          sessionData.message = message
          sessionData.finishReason = finishReason
          sessionData.completed = true
        }
      } else {
        const choice = data.choices?.[0]
        sessionData.content += choice?.delta?.content || ''
        if (choice?.finish_reason !== undefined && choice.finish_reason !== null) sessionData.finishReason = choice.finish_reason
        for (const delta of choice?.delta?.tool_calls || []) {
          const index = Number.isInteger(delta.index) ? delta.index : chatToolCalls.size
          const current = chatToolCalls.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } }
          if (delta.id) current.id += delta.id
          if (delta.type) current.type = delta.type
          if (delta.function?.name) current.function.name += delta.function.name
          if (delta.function?.arguments) current.function.arguments += delta.function.arguments
          chatToolCalls.set(index, current)
        }
      }
    } catch (error) {
      fail(error instanceof SyntaxError ? new Error('AI 流式数据格式错误') : error)
    }
  }

  const processLines = (shouldFlush = false) => {
    const lines = buffer.split('\n')
    buffer = shouldFlush ? '' : lines.pop()
    for (const line of lines) {
      if (!line.trim()) processEvent()
      else if (line.startsWith('data:')) eventLines.push(line.slice(5).replace(/^ /, '').replace(/\r$/, ''))
    }
    if (shouldFlush) processEvent()
  }

  sessionData.stream.on('data', (chunk) => {
    buffer += decoder.write(chunk)
    processLines()
  })

  sessionData.stream.on('end', () => {
    buffer += decoder.end()
    processLines(true)
    if (sessionData.protocol === 'responses' && !sessionData.completed) fail(new Error('AI 回复中断，未收到完成事件，请重试'))
    if (sessionData.protocol !== 'responses' && !sessionData.completed) fail(new Error('AI 回复中断，未收到完成标记，请重试'))
  })

  sessionData.stream.on('error', (error) => {
    fail(error)
  })

  sessionData.stream.on('close', () => {
    if (!sessionData.completed && !sessionData.stopped) fail(new Error('AI 连接提前关闭，请重试'))
  })
}
