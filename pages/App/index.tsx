'use client'

import { Tabs, Typography } from '@douyinfe/semi-ui';
import styles from './index.module.css';

import AccountManagement from './components/AccountManagement';
import VideoManagement from './components/VideoManagement';
import MaterialPublish from './components/MaterialPublish';
import AIGenerate from './components/AIGenerate';
import SocialMediaFetch from './components/SocialMediaFetch';

const { Title, Text } = Typography;

export default function App() {
  return (
    <main className={styles.main}>
      <div style={{ marginBottom: 16 }}>
        <Title heading={4} style={{ marginBottom: 4 }}>
          TikTok 运营助手
        </Title>
        <Text type="tertiary">
          专业的 TikTok 账号运营管理工具，提供账号管理、视频数据分析、素材发布、AI视频生成、社媒数据获取等一站式运营解决方案。
        </Text>
          </div>

      <Tabs type="line" defaultActiveKey="account">
        <Tabs.TabPane tab="账号管理" itemKey="account">
          <AccountManagement />
        </Tabs.TabPane>

        <Tabs.TabPane tab="视频列表" itemKey="video">
          <VideoManagement />
        </Tabs.TabPane>

        <Tabs.TabPane tab="素材发布" itemKey="material">
          <MaterialPublish />
        </Tabs.TabPane>

        <Tabs.TabPane tab="AI生成" itemKey="ai">
          <AIGenerate />
        </Tabs.TabPane>

        <Tabs.TabPane tab="社媒获取" itemKey="social">
          <SocialMediaFetch />
        </Tabs.TabPane>
      </Tabs>
    </main>
  );
}