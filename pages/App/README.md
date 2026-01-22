# App 目录结构说明

## 目录结构

```
pages/App/
├── index.tsx                    # 主入口文件，连接不同功能模块
├── index.module.css             # 主样式文件
├── constants.ts                 # 常量配置（TikTok相关URL等）
├── components/                  # 功能组件目录
│   └── AccountManagement.tsx   # 账号管理功能组件
└── utils/                       # 工具函数目录
    ├── fieldUtils.ts           # 字段操作工具函数
    └── recordUtils.ts          # 记录操作工具函数
```

## 文件说明

### index.tsx
- **作用**: 主入口文件，负责连接和展示不同的功能模块
- **功能**: 
  - 提供统一的页面布局
  - 管理功能模块的切换（通过 activeTab 状态）
  - 后续可以轻松添加新的功能模块

### constants.ts
- **作用**: 存放所有常量配置
- **内容**: 
  - `TIKTOK_AUTH_URL`: TikTok授权URL
  - `TIKTOK_USER_INFO_API`: TikTok用户信息API地址

### components/AccountManagement.tsx
- **作用**: 账号管理功能组件
- **功能**:
  - 复制TikTok授权链接
  - 新增账号（解析JSON并保存到表格）
  - 更新所有账号信息（批量更新）

### utils/fieldUtils.ts
- **作用**: 字段操作相关的工具函数
- **函数**:
  - `getFieldStringValue`: 获取字段值的字符串形式（处理段格式）
  - `getFieldTypeByValue`: 根据值的类型决定字段类型
  - `convertValueByFieldType`: 根据字段类型转换值
  - `findOrCreateField`: 查找或创建字段

### utils/recordUtils.ts
- **作用**: 记录操作相关的工具函数
- **函数**:
  - `findRecordByOpenId`: 通过open_id查找记录ID

## 如何添加新功能

1. 在 `components/` 目录下创建新的功能组件（如 `VideoManagement.tsx`）
2. 在 `index.tsx` 中导入新组件
3. 在 `index.tsx` 中添加新的 tab 状态（如需要）
4. 在渲染逻辑中添加新组件的条件渲染

示例：
```tsx
// index.tsx
import VideoManagement from './components/VideoManagement';

// 在组件中添加
{activeTab === 'video' && <VideoManagement />}
```

## 优势

1. **模块化**: 每个功能独立成组件，便于维护
2. **可扩展**: 轻松添加新功能模块
3. **代码复用**: 工具函数可在多个组件中复用
4. **清晰的结构**: 职责分离，代码更易理解




