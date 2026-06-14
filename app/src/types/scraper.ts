export interface TemplateBlock {
  id: string;
  type: "title" | "text" | "image" | "link" | "badge" | "date";
  field: string;
  label?: string;
}
