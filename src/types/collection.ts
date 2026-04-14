export interface Collection {
  id: number;
  category_id: number;
  user_id: number;
  user_name?: string;
  title: string;
  description?: string | null;
  image_id?: string | null;
  tags?: string[] | null;
  is_public: boolean;
  primary_keywords?: string[] | null;
  selection_num?: number;
  like_num?: number;
  created_at?: string;
  has_liked?: boolean;
}
