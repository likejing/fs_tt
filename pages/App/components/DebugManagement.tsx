'use client'
import { bitable, ITableMeta, IViewMeta, FieldType } from "@lark-base-open/js-sdk";
import { Button, Form, Toast, Typography, Space } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef, useCallback } from 'react';
import { BaseFormApi } from '@douyinfe/semi-foundation/lib/es/form/interface';
import { getFieldStringValue } from '../utils/fieldUtils';

const { Title, Text } = Typography;

export default function DebugManagement() {
  const [tableMetaList, setTableMetaList] = useState<ITableMeta[]>();
  const [viewMetaList, setViewMetaList] = useState<IViewMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const formApi = useRef<BaseFormApi>();

  // 当选择数据表时，加载对应的视图列表
  const handleTableChange = useCallback(async (tableId: string) => {
    if (!tableId) {
      setViewMetaList([]);
      formApi.current?.setValue('view', '');
      return;
    }

    try {
      const table = await bitable.base.getTableById(tableId);
      const views = await table.getViewMetaList();
      setViewMetaList(views);
      
      // 如果有视图，默认选择第一个
      if (views.length > 0) {
        formApi.current?.setValue('view', views[0].id);
      }
    } catch (error: any) {
      console.error('获取视图列表失败:', error);
      Toast.error(`获取视图列表失败: ${error.message}`);
      setViewMetaList([]);
    }
  }, []);

  // 获取并打印所有记录数据
  const handleFetchRecords = useCallback(async ({ 
    table: tableId, 
    view: viewId 
  }: { 
    table: string; 
    view: string;
  }) => {
    if (!tableId) {
      Toast.error('请先选择数据表');
      return;
    }

    setLoading(true);
    setDebugData(null);

    try {
      const table = await bitable.base.getTableById(tableId);
      
      // 获取字段列表
      const fieldList = await table.getFieldList();
      console.log('=== 数据表字段列表 ===');
      const fieldInfoList = await Promise.all(fieldList.map(async (f: any) => {
        try {
          const fieldType = await f.getType();
          const fieldName = await f.getName();
          return {
            id: f.id,
            name: fieldName,
            type: fieldType
          };
        } catch (e) {
          console.warn(`获取字段信息失败 (ID: ${f.id}):`, e);
          // 如果获取名称失败，尝试使用 getFieldMetaById
          try {
            const fieldMeta = await table.getFieldMetaById(f.id);
            return {
              id: f.id,
              name: fieldMeta.name || `字段_${f.id}`,
              type: fieldMeta.type || 'unknown'
            };
          } catch (e2) {
            return {
              id: f.id,
              name: `字段_${f.id}`,
              type: 'unknown'
            };
          }
        }
      }));
      console.log(fieldInfoList);

      // 获取视图（如果指定了视图）
      let view = null;
      if (viewId) {
        try {
          view = await table.getViewById(viewId);
          console.log('=== 选择的视图 ===');
          console.log({
            id: viewId,
            name: viewMetaList.find(v => v.id === viewId)?.name || '未知'
          });
        } catch (e) {
          console.warn('获取视图失败，使用默认视图:', e);
        }
      }

      // 获取所有记录
      console.log('=== 开始获取记录 ===');
      const recordsResponse = await table.getRecords({
        pageSize: 5000
      });
      
      const records = recordsResponse.records;
      console.log(`=== 共获取到 ${records.length} 条记录 ===`);

      // 处理每条记录
      const recordsData: any[] = [];
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const recordData: any = {
          recordId: record.recordId,
          fields: {}
        };

        // 遍历所有字段，获取每个字段的值
        for (let fieldIndex = 0; fieldIndex < fieldList.length; fieldIndex++) {
          const field = fieldList[fieldIndex];
          const fieldInfo = fieldInfoList[fieldIndex];
          const fieldName = fieldInfo?.name || `字段_${field.id}`;
          
          try {
            let fieldValue: any = null;
            let fieldType: any = fieldInfo?.type || 'unknown';
            let attachmentUrls: string[] | null = null; // 附件临时下载链接
            
            // 特殊处理附件字段
            if (fieldType === FieldType.Attachment) {
              try {
                // 获取附件字段对象
                const attachmentField = await table.getFieldById(field.id);
                // 获取附件列表
                const attachments = await attachmentField.getValue(record.recordId);
                
                if (Array.isArray(attachments) && attachments.length > 0) {
                  // 获取附件的临时下载链接
                  try {
                    attachmentUrls = await (attachmentField as any).getAttachmentUrls(record.recordId);
                    console.log(`字段 ${fieldName} 的附件临时下载链接:`, attachmentUrls);
                  } catch (urlError) {
                    console.warn(`获取附件临时下载链接失败:`, urlError);
                  }
                  
                  // 构建附件信息对象
                  fieldValue = attachments.map((att: any, index: number) => {
                    const attachmentInfo: any = {
                      name: att.name || '未知文件名',
                      size: att.size || 0,
                      type: att.type || '未知类型',
                      token: att.token || '',
                      timeStamp: att.timeStamp || 0
                    };
                    
                    // 如果有临时下载链接，添加到附件信息中
                    if (attachmentUrls && attachmentUrls[index]) {
                      attachmentInfo.tempDownloadUrl = attachmentUrls[index];
                      attachmentInfo.tempDownloadUrlExpiresIn = '10分钟'; // 临时链接有效期10分钟
                    }
                    
                    return attachmentInfo;
                  });
                } else {
                  fieldValue = [];
                }
              } catch (attachmentError) {
                console.warn(`处理附件字段 ${fieldName} 失败:`, attachmentError);
                fieldValue = null;
              }
            } else {
              // 非附件字段，使用原有方法获取值
              // 尝试多种方法获取字段值
              try {
                // 方法1：使用 getCellString（最可靠）
                const stringValue = await table.getCellString(field.id, record.recordId);
                if (stringValue) {
                  fieldValue = stringValue;
                }
              } catch (e1) {
                try {
                  // 方法2：使用 getCellValue
                  const cellValue = await table.getCellValue(field.id, record.recordId);
                  if (cellValue !== null && cellValue !== undefined) {
                    if (Array.isArray(cellValue)) {
                      // 处理段格式
                      fieldValue = cellValue.map((segment: any) => {
                        if (typeof segment === 'string') return segment;
                        if (segment && typeof segment === 'object') {
                          return segment.text || segment.link || segment;
                        }
                        return segment;
                      });
                    } else {
                      fieldValue = cellValue;
                    }
                  }
                } catch (e2) {
                  try {
                    // 方法3：直接从 record.fields 获取
                    const rawValue = record.fields[field.id];
                    if (rawValue !== null && rawValue !== undefined) {
                      if (Array.isArray(rawValue)) {
                        fieldValue = rawValue.map((segment: any) => {
                          if (typeof segment === 'string') return segment;
                          if (segment && typeof segment === 'object') {
                            return segment.text || segment.link || segment;
                          }
                          return segment;
                        });
                      } else {
                        fieldValue = rawValue;
                      }
                    }
                  } catch (e3) {
                    console.warn(`获取字段 ${fieldName} (${field.id}) 的值失败:`, e1, e2, e3);
                  }
                }
              }
            }

            recordData.fields[fieldName] = {
              fieldId: field.id,
              value: fieldValue,
              type: fieldType,
              ...(attachmentUrls && { attachmentUrls: attachmentUrls }) // 如果有附件链接，添加到字段数据中
            };
          } catch (e) {
            console.error(`处理字段 ${fieldName} 时出错:`, e);
            recordData.fields[fieldName] = {
              fieldId: field.id,
              value: null,
              error: String(e)
            };
          }
        }

        recordsData.push(recordData);
      }

      // 构建完整的调试数据
      const debugInfo = {
        table: {
          id: tableId,
          name: tableMetaList?.find(t => t.id === tableId)?.name || '未知',
          fieldCount: fieldList.length,
          recordCount: records.length
        },
        view: viewId ? {
          id: viewId,
          name: viewMetaList.find(v => v.id === viewId)?.name || '未知'
        } : null,
        fields: fieldInfoList,
        records: recordsData,
        timestamp: new Date().toISOString()
      };

      // 保存到状态
      setDebugData(debugInfo);

      // 打印列名（字段名）列表
      console.log('\n========================================');
      console.log('=== 数据表列名（字段名）列表 ===');
      console.log('========================================');
      const columnNames = fieldInfoList.map(f => f.name);
      console.table(columnNames);
      console.log(`\n共 ${columnNames.length} 个字段：`);
      fieldInfoList.forEach((field, index) => {
        const typeName = field.type === FieldType.Attachment ? '附件' : 
                        field.type === FieldType.Text ? '文本' :
                        field.type === FieldType.Number ? '数字' :
                        field.type === FieldType.SingleSelect ? '单选' :
                        field.type === FieldType.MultiSelect ? '多选' :
                        field.type === FieldType.DateTime ? '日期时间' :
                        field.type === FieldType.Checkbox ? '复选框' :
                        field.type === FieldType.Url ? '超链接' :
                        field.type;
        console.log(`${index + 1}. ${field.name} (类型: ${typeName} [${field.type}], ID: ${field.id})`);
      });

      // 打印每条记录的完整数据
      console.log('\n========================================');
      console.log(`=== 记录数据（共 ${records.length} 条）===`);
      console.log('========================================');
      console.log('💡 提示：附件字段的临时下载链接有效期为10分钟\n');
      
      recordsData.forEach((record, index) => {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`记录 ${index + 1} / ${records.length}`);
        console.log(`记录ID: ${record.recordId}`);
        console.log(`${'='.repeat(50)}`);
        
        // 以表格形式打印每条记录
        const recordTable: any = {};
        Object.entries(record.fields).forEach(([fieldName, fieldData]: [string, any]) => {
          let displayValue = fieldData.value;
          
          // 处理复杂数据类型
          if (displayValue === null || displayValue === undefined) {
            displayValue = '(空)';
          } else if (Array.isArray(displayValue)) {
            // 如果是数组，尝试格式化为字符串
            if (displayValue.length === 0) {
              displayValue = '[]';
            } else {
              // 如果是附件数组，特殊处理
              if (fieldData.type === FieldType.Attachment && displayValue.length > 0 && displayValue[0].tempDownloadUrl) {
                displayValue = displayValue.map((att: any) => 
                  `${att.name} (${att.size} bytes) - 临时下载链接: ${att.tempDownloadUrl}`
                ).join('\n');
              } else {
                displayValue = JSON.stringify(displayValue, null, 2);
              }
            }
          } else if (typeof displayValue === 'object') {
            displayValue = JSON.stringify(displayValue, null, 2);
          }
          
          recordTable[fieldName] = displayValue;
        });
        
        console.table(recordTable);
        
        // 同时以键值对形式打印（便于复制）
        console.log('\n--- 详细数据（键值对格式）---');
        Object.entries(record.fields).forEach(([fieldName, fieldData]: [string, any]) => {
          // 如果是附件字段且有临时下载链接，特殊打印
          if (fieldData.type === FieldType.Attachment && Array.isArray(fieldData.value) && fieldData.value.length > 0) {
            console.log(`\n${fieldName} (附件字段):`);
            fieldData.value.forEach((att: any, idx: number) => {
              console.log(`  附件 ${idx + 1}:`);
              console.log(`    文件名: ${att.name}`);
              console.log(`    大小: ${att.size} bytes`);
              console.log(`    类型: ${att.type}`);
              console.log(`    Token: ${att.token}`);
              if (att.tempDownloadUrl) {
                console.log(`    ⭐ 临时下载链接: ${att.tempDownloadUrl}`);
                console.log(`    ⏰ 链接有效期: ${att.tempDownloadUrlExpiresIn || '10分钟'}`);
              }
            });
            if (fieldData.attachmentUrls && fieldData.attachmentUrls.length > 0) {
              console.log(`  所有临时下载链接:`, fieldData.attachmentUrls);
            }
          } else {
            console.log(`${fieldName}:`, fieldData.value);
          }
        });
      });

      // 打印完整JSON数据（便于复制）
      console.log('\n========================================');
      console.log('=== 完整JSON数据（便于复制）===');
      console.log('========================================');
      console.log(JSON.stringify(debugInfo, null, 2));

      Toast.success(`成功获取 ${records.length} 条记录，数据已打印到控制台`);
    } catch (error: any) {
      console.error('获取记录失败:', error);
      Toast.error(`获取失败: ${error.message || '未知错误'}`);
      setDebugData(null);
    } finally {
      setLoading(false);
    }
  }, [tableMetaList, viewMetaList]);

  useEffect(() => {
    Promise.all([
      bitable.base.getTableMetaList(),
      bitable.base.getSelection()
    ]).then(([metaList, selection]) => {
      setTableMetaList(metaList);
      if (selection.tableId) {
        formApi.current?.setValues({ table: selection.tableId });
        handleTableChange(selection.tableId);
      }
    });
  }, [handleTableChange]);

  return (
    <div>
      <Title heading={4} style={{ marginBottom: '1rem' }}>
        调试管理
      </Title>
      
      <Form 
        labelPosition='top' 
        onSubmit={handleFetchRecords} 
        getFormApi={(baseFormApi: BaseFormApi) => formApi.current = baseFormApi}
        style={{ marginTop: '1rem' }}
      >
        <Form.Slot label="操作说明">
          <div style={{ marginBottom: '1rem', fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
            <div>1. 选择要调试的数据表</div>
            <div>2. 选择视图（可选，不选择则使用默认视图）</div>
            <div>3. 点击&ldquo;获取记录数据&rdquo;按钮</div>
            <div>4. 所有记录数据将打印到浏览器控制台（按 F12 打开开发者工具查看）</div>
            <div style={{ marginTop: '0.5rem', color: '#1890ff', fontWeight: '500' }}>
              💡 提示：打开浏览器开发者工具（F12），切换到 Console 标签页查看打印的数据
            </div>
          </div>
        </Form.Slot>

        <Space vertical spacing="loose" style={{ width: '100%' }}>
          <Form.Select 
            field='table' 
            label='选择数据表' 
            placeholder="请选择数据表" 
            style={{ width: '100%' }}
            rules={[{ required: true, message: '请选择数据表' }]}
            onChange={(value) => {
              if (value) {
                handleTableChange(value as string);
              }
            }}
          >
            {
              Array.isArray(tableMetaList) && tableMetaList.map(({ name, id }) => {
                return (
                  <Form.Select.Option key={id} value={id}>
                    {name}
                  </Form.Select.Option>
                );
              })
            }
          </Form.Select>

          <Form.Select 
            field='view' 
            label='选择视图（可选）' 
            placeholder="请选择视图（可选）" 
            style={{ width: '100%' }}
            disabled={viewMetaList.length === 0}
          >
            {
              Array.isArray(viewMetaList) && viewMetaList.map(({ name, id }) => {
                return (
                  <Form.Select.Option key={id} value={id}>
                    {name}
                  </Form.Select.Option>
                );
              })
            }
          </Form.Select>

          <Button 
            theme='solid' 
            type="primary"
            htmlType='submit' 
            loading={loading}
            style={{ width: '100%' }}
          >
            获取记录数据
          </Button>

          {debugData && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '4px',
              fontSize: '12px'
            }}>
              <Text strong>调试信息摘要：</Text>
              <div style={{ marginTop: '0.5rem' }}>
                <div>数据表：{debugData.table.name}</div>
                <div>字段数：{debugData.table.fieldCount}</div>
                <div>记录数：{debugData.table.recordCount}</div>
                {debugData.view && <div>视图：{debugData.view.name}</div>}
                <div style={{ marginTop: '0.5rem', color: '#666' }}>
                  完整数据已打印到控制台，请按 F12 打开开发者工具查看
                </div>
              </div>
            </div>
          )}
        </Space>
      </Form>
    </div>
  );
}

