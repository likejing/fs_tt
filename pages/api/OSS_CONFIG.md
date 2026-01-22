# 阿里云OSS配置说明

## 环境变量配置

在项目根目录的 `.env.local` 文件中添加以下环境变量：

```env
# 阿里云OSS配置
OSS_REGION=cn-qingdao                          # OSS区域，例如：cn-qingdao, cn-hangzhou, cn-beijing
OSS_ACCESS_KEY_ID=your_access_key_id            # 阿里云AccessKey ID
OSS_ACCESS_KEY_SECRET=your_access_key_secret    # 阿里云AccessKey Secret
OSS_BUCKET_NAME=your_bucket_name                # OSS存储桶名称（推荐使用OSS_BUCKET_NAME，也支持OSS_BUCKET）
OSS_ENDPOINT=oss-cn-qingdao.aliyuncs.com        # OSS端点（可选，如果不设置则根据OSS_REGION自动构建）
```

## 配置示例

```env
OSS_REGION=cn-qingdao
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_ENDPOINT=oss-cn-qingdao.aliyuncs.com
OSS_BUCKET_NAME=chaomeiai
```

## 获取阿里云AccessKey

1. 登录阿里云控制台
2. 进入"访问控制" -> "用户" -> 创建用户或选择已有用户
3. 为用户添加"AliyunOSSFullAccess"权限（或自定义权限）
4. 创建AccessKey，获取AccessKey ID和AccessKey Secret

## OSS存储桶配置

1. 在OSS控制台创建存储桶（Bucket）
2. 记录存储桶名称和区域
3. 确保存储桶的读写权限配置正确

## 注意事项

- AccessKey Secret 是敏感信息，请妥善保管，不要提交到代码仓库
- 建议使用RAM用户，并只授予必要的OSS权限
- 上传的文件会保存在 `tiktok-videos/` 目录下（可在代码中修改）

