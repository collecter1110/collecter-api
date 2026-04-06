export interface Selection {
  selection_id: number;
  collection_id: number;
  category_id: number;
  user_id: number;
  owner_id: number;
  owner_name?: string;
  title: string;
  description?: string | null;
  image_file_paths?: string[] | null;
  thumb_file_path?: string | null;
  keywords?: Record<string, unknown>[];
  link?: string | null;
  items?: Record<string, unknown>[] | null;
  is_ordered: boolean;
  is_selectable: boolean;
  is_selecting?: boolean;
  created_at?: string;
}
