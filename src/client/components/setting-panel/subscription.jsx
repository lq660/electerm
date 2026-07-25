import { CheckCircleOutlined } from '@ant-design/icons'
import { Button, Tag } from 'antd'
import message from '../common/message'
import {
  getCurrentPlan,
  getCurrentPlanName,
  planComparisonGroups,
  planDescriptions,
  planFeatureGroups,
  planIds,
  planNames,
  planTags,
  planTargets
} from '../../common/feature-plans'

export default function SubscriptionSettings ({ config, store }) {
  const currentPlan = getCurrentPlan(config)

  function handlePlanChange (plan) {
    // 2026-07-24 coder(lq): Local plan switching is a temporary product validation path; replace with signed server licenses before public release.
    store.setConfig({
      licensePlan: plan,
      licenseExpiresAt: plan === planIds.personal ? '' : '本地测试授权'
    })
    message.success(`已切换到${planNames[plan]}`)
  }

  function renderPlanCheck (plans, plan) {
    const included = plans.includes(plan)
    return (
      <span className={`subscription-compare-cell ${included ? 'included' : 'excluded'}`}>
        {included ? <CheckCircleOutlined /> : '—'}
      </span>
    )
  }

  return (
    <div className='subscription-settings'>
      <section className='cn-settings-section subscription-overview'>
        <div className='cn-settings-section-title'>
          <strong>当前版本</strong>
          <span>第一期先用本地授权验证功能分层，后续再接激活码、账号和支付。</span>
        </div>
        <div className='subscription-current-card'>
          <div>
            <span>正在使用</span>
            <strong>{getCurrentPlanName(config)}</strong>
            <em>{config.licenseExpiresAt || '永久免费'}</em>
          </div>
          <Tag color={currentPlan === planIds.personal ? 'default' : 'blue'}>
            {planTags[currentPlan]}
          </Tag>
        </div>
      </section>

      <section className='cn-settings-section'>
        <div className='cn-settings-section-title'>
          <strong>版本能力</strong>
          <span>个人版负责基础连接，专业版负责效率，团队版负责协作和管控。</span>
        </div>
        <div className='subscription-plan-grid'>
          {planFeatureGroups.map(group => (
            <div
              className={`subscription-plan-card ${currentPlan === group.plan ? 'active' : ''}`}
              key={group.plan}
            >
              <div className='subscription-plan-head'>
                <div>
                  <strong>{planNames[group.plan]}</strong>
                  <span>{group.price}</span>
                </div>
                <Tag color={currentPlan === group.plan ? 'blue' : 'default'}>
                  {currentPlan === group.plan ? '当前版本' : planTags[group.plan]}
                </Tag>
              </div>
              <p className='subscription-plan-highlight'>{group.highlight}</p>
              <p className='subscription-plan-target'>{planTargets[group.plan]}</p>
              <ul>
                {group.features.map(feature => (
                  <li key={feature}>
                    <CheckCircleOutlined />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className='subscription-plan-limits'>
                {group.limits.map(limit => (
                  <span key={limit}>{limit}</span>
                ))}
              </div>
              <Button
                type={currentPlan === group.plan ? 'default' : 'primary'}
                block
                disabled={currentPlan === group.plan}
                onClick={() => handlePlanChange(group.plan)}
              >
                {currentPlan === group.plan ? '已启用' : '切换测试'}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className='cn-settings-section'>
        <div className='cn-settings-section-title'>
          <strong>能力对比</strong>
          <span>按用户规模拆分基础连接、效率增强和团队管控，后续授权接入后沿用同一份能力控制。</span>
        </div>
        <div className='subscription-compare'>
          <div className='subscription-compare-head'>
            <span>能力项</span>
            {planFeatureGroups.map(group => (
              <strong key={group.plan}>{planNames[group.plan]}</strong>
            ))}
          </div>
          {planComparisonGroups.map(group => (
            <div className='subscription-compare-group' key={group.title}>
              <div className='subscription-compare-title'>{group.title}</div>
              {group.items.map(item => (
                <div className='subscription-compare-row' key={item.name}>
                  <span>{item.name}</span>
                  {planFeatureGroups.map(group => (
                    <span key={group.plan}>
                      {renderPlanCheck(item.plans, group.plan)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className='cn-settings-section subscription-release-note'>
        <div className='cn-settings-section-title'>
          <strong>产品落地顺序</strong>
          <span>{planDescriptions[planIds.personal]}专业版和团队版先用本地开关验证，后续再接账号、支付和服务端授权。</span>
        </div>
      </section>
    </div>
  )
}
