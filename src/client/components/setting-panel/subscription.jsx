import { CheckCircleOutlined } from '@ant-design/icons'
import { Button, Tag } from 'antd'
import message from '../common/message'
import {
  getCurrentPlan,
  getCurrentPlanName,
  getFeatureLabel,
  getFeatureStatus,
  planComparisonGroups,
  planDescriptions,
  featureStatusLabels,
  planFeatureGroups,
  planIds,
  planNames,
  planTags,
  planTargets
} from '../../common/feature-plans'

export default function SubscriptionSettings ({ config, store }) {
  const currentPlan = getCurrentPlan(config)
  const currentPlanName = getCurrentPlanName(config)
  const currentPlanMeta = [
    {
      label: '授权状态',
      value: config.licenseExpiresAt || '永久免费'
    },
    {
      label: '版本定位',
      value: planTags[currentPlan]
    },
    {
      label: '落地阶段',
      value: currentPlan === planIds.personal ? '本机基础' : '本地测试授权'
    }
  ]

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

  function renderFeatureStatus (item) {
    const status = getFeatureStatus(item)
    return (
      <Tag className={`subscription-status-tag ${status}`}>
        {featureStatusLabels[status]}
      </Tag>
    )
  }

  return (
    <div className='subscription-settings'>
      <section className='subscription-hero'>
        <div className='subscription-hero-main'>
          <span>当前版本</span>
          <strong>{currentPlanName}</strong>
          <em>{planDescriptions[currentPlan]}</em>
        </div>
        <div className='subscription-hero-meta'>
          {currentPlanMeta.map(item => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className='cn-settings-section subscription-plans-section'>
        <div className='cn-settings-section-title'>
          <strong>版本能力</strong>
          <span>个人版管基础连接，专业版管效率增强，团队版管协作和安全。</span>
        </div>
        <div className='subscription-plan-grid'>
          {planFeatureGroups.map(group => {
            const visibleFeatures = group.features.slice(0, 5)
            const hiddenCount = group.features.length - visibleFeatures.length
            return (
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
                  {visibleFeatures.map(feature => (
                    <li key={getFeatureLabel(feature)}>
                      <CheckCircleOutlined />
                      <span>{getFeatureLabel(feature)}</span>
                      {renderFeatureStatus(feature)}
                    </li>
                  ))}
                  {
                    hiddenCount > 0
                      ? (
                        <li className='subscription-feature-more'>
                          <CheckCircleOutlined />
                          <span>另含 {hiddenCount} 项扩展能力，见下方对比</span>
                        </li>
                        )
                      : null
                  }
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
                  {currentPlan === group.plan ? '当前已启用' : `切换到${planNames[group.plan]}`}
                </Button>
              </div>
            )
          })}
        </div>
      </section>

      <section className='cn-settings-section subscription-note'>
        <div>
          <strong>当前规则</strong>
          <span>第一期先用本地授权验证能力分层；后续接入激活码、账号体系、支付和服务端授权时，沿用同一套能力控制。</span>
        </div>
      </section>

      <section className='cn-settings-section subscription-compare-section'>
        <div className='cn-settings-section-title'>
          <strong>能力对比</strong>
          <span>用于确认不同版本的边界，便于后续接入真实授权。</span>
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
                  <span>
                    <em>{item.name}</em>
                    {renderFeatureStatus(item)}
                  </span>
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
    </div>
  )
}
