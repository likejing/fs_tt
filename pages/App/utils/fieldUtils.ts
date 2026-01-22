// 字段操作工具函数
import { bitable, FieldType } from "@lark-base-open/js-sdk";

/**
 * 获取字段值的字符串形式（处理段格式）
 */
export async function getFieldStringValue(
  table: any,
  field: any,
  recordId: string
): Promise<string | null> {
  try {
    // 方法1：使用getCellString（最可靠）
    const value = await table.getCellString(field.id, recordId);
    if (value) return String(value).trim();
  } catch (e1) {
    try {
      // 方法2：使用getCellValue
      const cellValue = await table.getCellValue(field.id, recordId);
      if (Array.isArray(cellValue)) {
        // 处理段格式
        const text = cellValue
          .map((segment: any) => {
            if (typeof segment === 'string') return segment;
            if (segment && typeof segment === 'object') {
              return segment.text || segment.link || '';
            }
            return '';
          })
          .join('');
        return text.trim() || null;
      } else if (cellValue !== null && cellValue !== undefined) {
        return String(cellValue).trim();
      }
    } catch (e2) {
      console.warn(`获取字段 ${field.name} 的值失败:`, e1, e2);
    }
  }
  return null;
}

/**
 * 根据值的类型决定字段类型
 */
export function getFieldTypeByValue(value: any): FieldType {
  if (typeof value === 'number') {
    return FieldType.Number;
  } else if (typeof value === 'boolean') {
    return FieldType.Checkbox;
  } else {
    return FieldType.Text;
  }
}

/**
 * 根据字段类型转换值
 */
export async function convertValueByFieldType(
  field: any,
  value: any
): Promise<any> {
  let fieldType: FieldType;
  try {
    fieldType = await field.getType();
  } catch (e) {
    console.warn(`获取字段类型失败，默认使用文本类型:`, e);
    fieldType = FieldType.Text;
  }

  let fieldValue: any = null;

  if (fieldType === FieldType.Text) {
    // 文本字段：将值转换为字符串
    if (value !== null && value !== undefined) {
      fieldValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  } else if (fieldType === FieldType.Number) {
    // 数字字段
    const numValue = Number(value);
    if (!isNaN(numValue) && isFinite(numValue)) {
      fieldValue = numValue;
    } else {
      console.warn(`值 ${value} 无法转换为数字，尝试保存为文本`);
      fieldValue = String(value);
    }
  } else if (fieldType === FieldType.Checkbox) {
    // 复选框字段
    fieldValue = Boolean(value);
  } else {
    // 其他类型字段，尝试转换为文本
    if (value !== null && value !== undefined) {
      fieldValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  }

  return fieldValue;
}

/**
 * 查找或创建字段
 */
export async function findOrCreateField(
  table: any,
  fieldList: any[],
  fieldName: string,
  fieldType?: FieldType
): Promise<any> {
  // 先查找是否存在
  let field = fieldList.find((f: any) => f.name === fieldName);
  
  if (field) {
    return field;
  }

  // 如果不存在，尝试通过名称获取（可能在其他地方已创建）
  try {
    field = await table.getFieldByName(fieldName);
    if (field) {
      const existingIndex = fieldList.findIndex((f: any) => f.id === field.id);
      if (existingIndex === -1) {
        fieldList.push(field);
      }
      return field;
    }
  } catch (e) {
    // 字段不存在，继续创建
  }

  // 如果指定了类型，创建新字段
  if (fieldType !== undefined) {
    try {
      const fieldId = await table.addField({
        type: fieldType,
        name: fieldName
      });
      
      // 通过ID获取字段对象
      try {
        field = await table.getFieldById(fieldId);
      } catch (e) {
        field = await table.getFieldByName(fieldName);
      }
      
      // 更新字段列表
      const updatedFieldList = await table.getFieldList();
      const foundField = updatedFieldList.find((f: any) => f.id === fieldId || f.name === fieldName);
      if (foundField) {
        const existingIndex = fieldList.findIndex((f: any) => f.id === foundField.id);
        if (existingIndex === -1) {
          fieldList.push(foundField);
        } else {
          fieldList[existingIndex] = foundField;
        }
        return foundField;
      } else if (field) {
        fieldList.push(field);
        return field;
      }
    } catch (e: any) {
      console.warn(`创建字段 ${fieldName} 失败:`, e);
      // 再次尝试获取（可能已存在）
      try {
        field = await table.getFieldByName(fieldName);
        if (field) {
          const existingIndex = fieldList.findIndex((f: any) => f.id === field.id);
          if (existingIndex === -1) {
            fieldList.push(field);
          }
          return field;
        }
      } catch (e2) {
        console.error(`获取字段 ${fieldName} 失败:`, e2);
      }
    }
  }

  return null;
}




