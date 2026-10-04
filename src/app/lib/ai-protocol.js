// 2026-09-09 coder(lq): Keep wire-protocol differences out of AgentRun; its messages and tool IDs remain Chat-compatible.
function getAIProtocol (url) {
  return /\/responses\/?$/.test(new URL(url).pathname) ? 'responses' : 'chat'
}

function inputContent (content, role) {
  if (typeof content === 'string') return content
  if (content == null) return ''
  if (!Array.isArray(content)) throw new Error('AI 消息内容格式不正确')
  return content.map(part => {
    if (part.type === 'text') {
      return role === 'assistant'
        ? { type: 'output_text', text: part.text, annotations: [] }
        : { type: 'input_text', text: part.text }
    }
    if (part.type === 'image_url' && role === 'user') {
      const image = part.image_url
      return { type: 'input_image', image_url: image.url, ...(image.detail ? { detail: image.detail } : {}) }
    }
    throw new Error(`Responses 暂不支持此消息内容类型：${part.type}`)
  })
}

function responsesInput (messages) {
  return messages.flatMap(message => {
    if (message.role === 'tool') {
      return [{ type: 'function_call_output', call_id: message.tool_call_id, output: message.content }]
    }
    // 2026-09-09 coder(lq): Stateless continuation must replay reasoning, phase and call_id, not just the visible answer or item ID.
    if (message.role === 'assistant' && Array.isArray(message.responsesOutput)) {
      return message.responsesOutput
    }
    const items = []
    if (message.content || !message.tool_calls?.length) {
      items.push({ role: message.role, content: inputContent(message.content, message.role) })
    }
    for (const call of message.tool_calls || []) {
      items.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments })
    }
    return items
  })
}

function buildAIRequest ({ model, messages, stream, tools, toolChoice, reasoningEffort }, protocol) {
  const responses = protocol === 'responses'
  const data = responses
    ? { model, input: responsesInput(messages), stream, store: false, include: ['reasoning.encrypted_content'] }
    : { model, messages: messages.map(({ responsesOutput, ...message }) => message), stream }
  if (reasoningEffort && reasoningEffort !== 'auto') {
    if (responses) data.reasoning = { effort: reasoningEffort }
    else data.reasoning_effort = reasoningEffort
  }
  if (tools?.length) {
    data.tools = responses
      ? tools.map(tool => {
        if (tool.type !== 'function' || !tool.function) throw new Error('Responses 工具必须使用 function 定义')
        // 2026-09-09 coder(lq): Existing tool schemas contain optional fields; do not let Responses implicitly require all of them.
        return { ...tool.function, type: 'function', strict: tool.function.strict ?? false }
      })
      : tools
    data.parallel_tool_calls = false
  }
  if (toolChoice) {
    data.tool_choice = responses && toolChoice.type === 'function'
      ? { type: 'function', name: toolChoice.function?.name || toolChoice.name }
      : toolChoice
  }
  return data
}

function parseAIResponse (data, protocol) {
  if (data?.error) throw new Error(data.error.message || 'AI 服务返回错误')
  if (protocol !== 'responses') {
    const choice = data?.choices?.[0]
    if (!choice?.message) throw new Error('AI provider returned no assistant message')
    return { message: choice.message, finishReason: choice.finish_reason || null }
  }
  if (data?.status !== 'completed') {
    throw new Error(`AI 回复未完成：${data?.incomplete_details?.reason || data?.status || '缺少完成状态'}`)
  }
  if (!Array.isArray(data.output)) throw new Error('Responses 接口未返回有效的 output')
  let content = ''
  const calls = []
  for (const item of data.output) {
    if (item.type === 'message') {
      for (const part of item.content || []) {
        if (part.type === 'output_text') content += part.text || ''
        if (part.type === 'refusal') content += part.refusal || ''
      }
    } else if (item.type === 'function_call') {
      if (!item.call_id || !item.name || typeof item.arguments !== 'string') {
        throw new Error('Responses 工具调用缺少 call_id、name 或 arguments')
      }
      let args
      try { args = JSON.parse(item.arguments) } catch {}
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Responses 工具参数不是有效的 JSON 对象')
      calls.push({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } })
    }
  }
  if (!content && !calls.length) throw new Error('Responses 接口未返回可用的回答或工具调用')
  return {
    message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls } : {}), responsesOutput: data.output },
    finishReason: calls.length ? 'tool_calls' : 'stop'
  }
}

module.exports = { getAIProtocol, buildAIRequest, parseAIResponse }
