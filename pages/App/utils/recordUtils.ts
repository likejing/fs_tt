// 记录操作工具函数
import { bitable } from "@lark-base-open/js-sdk";
import { getFieldStringValue } from './fieldUtils';

/**
 * 查找记录ID（通过open_id）
 */
export async function findRecordByOpenId(
  table: any,
  openIdField: any,
  openId: string
): Promise<string | null> {
  try {
    // 获取所有记录
    const records = await table.getRecords({
      pageSize: 5000
    });

    console.log(`开始查找已存在的账号，open_id: ${openId}，共 ${records.records.length} 条记录`);

    // 遍历记录查找匹配的open_id
    for (const record of records.records) {
      try {
        const recordOpenId = await getFieldStringValue(table, openIdField, record.recordId);
        
        // 比较open_id值
        const currentOpenId = String(openId || '').trim();
        const recordOpenIdStr = String(recordOpenId || '').trim();
        
        console.log(`比较 open_id - 当前: "${currentOpenId}", 记录中的: "${recordOpenIdStr}" (recordId: ${record.recordId})`);
        
        if (recordOpenIdStr && currentOpenId && recordOpenIdStr === currentOpenId) {
          console.log(`✅ 找到已存在的账号，recordId: ${record.recordId}, open_id: ${openId}`);
          return record.recordId;
        }
      } catch (e) {
        // 如果获取字段值失败，继续查找下一条
        console.warn(`获取记录 ${record.recordId} 的open_id失败:`, e);
        continue;
      }
    }

    console.log(`未找到已存在的账号，将新增，open_id: ${openId}`);
    return null;
  } catch (e) {
    console.warn('查找已存在记录时出错，将直接新增:', e);
    return null;
  }
}




