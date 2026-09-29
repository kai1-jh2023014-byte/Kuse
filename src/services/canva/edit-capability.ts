import type { StoredTool } from "./types";

export interface EditCapability {
  canEditInPlace: false;
  reason: string;
}

/**
 * Natural-language revision of an existing design is not sent unless a connected
 * tool schema exposes one unambiguous prompt field and a design id field.
 * perform-editing-operations takes structured operations, which this prompt is not.
 */
export function editCapability(tools: StoredTool[] | undefined): EditCapability {
  const editor = tools?.find((tool) => tool.name === "perform-editing-operations");
  const properties = editor?.inputSchema?.properties;
  const promptField = properties
    ? Object.entries(properties).find(([name, schema]) => {
        const type = schema.type;
        const isString = type === "string" || (Array.isArray(type) && type.includes("string"));
        return isString && /prompt|instruction|query/i.test(`${name} ${schema.description ?? ""}`);
      })
    : undefined;
  if (!editor || !promptField) {
    return {
      canEditInPlace: false,
      reason:
        "既存の生成結果を自然文で自動編集する公式APIは、接続中のツール一覧から確認できません。改善プロンプトは作れるので、新しい候補として Canva に渡せます。",
    };
  }
  return {
    canEditInPlace: false,
    reason:
      "編集ツールは見つかりましたが、自然文の改善だけを安全に渡す引数が一意ではないため、既存デザインは自動編集しません。",
  };
}
