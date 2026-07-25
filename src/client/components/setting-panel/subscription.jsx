import { CheckCircleOutlined } from '@ant-design/icons'
import { Button, Tag } from 'antd'
import message from '../common/message'
import {
  getCurrentPlan,
  getCurrentPlanName,
  planFeatureGroups,
  planIds,
  planNames
} from '../../common/feature-plans'

export default function SubscriptionSettings ({ config, store }) {
  const currentPlan = getCurrentPlan(config)

  function handlePlanChange (plan) {
    // 2026-07-24 coder(lq): Local plan switching is a temporary product validation path; replace with signed server licenses before public release.
    store.setConfig({
      licensePlan: plan,
      licenseExpiresAt: plan === planIds.free ? '' : '本地测试授权'
    })
    message.success(`已切换到${planNames[plan]}`)
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
          <Tag color={currentPlan === planIds.free ? 'default' : 'blue'}>
            {currentPlan === planIds.free ? '基础能力' : '高级能力'}
          </Tag>
        </div>
      </section>

      <section className='cn-settings-section'>
        <div className='cn-settings-section-title'>
          <strong>版本能力</strong>
          <span>免费版负责基础连接，个人专业版负责效率，团队版负责协作和管控。</span>
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
                {currentPlan === group.plan ? <Tag color='blue'>当前版本</Tag> : null}
              </div>
              <ul>
                {group.features.map(feature => (
                  <li key={feature}>
                    <CheckCircleOutlined />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
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
    </div>
  )
}
