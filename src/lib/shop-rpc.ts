import { supabase } from "@/integrations/supabase/client";

/**
 * فراخوان RPCهای ماژول فروشگاه.
 * چون توابع جدید هنوز در src/integrations/supabase/types.ts تولید نشده‌اند،
 * این wrapper مستقل از تایپ‌های تولیدی است (types.ts دستی ویرایش نمی‌شود).
 */
export async function shopRpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, (args ?? {}) as never);
  if (error) throw error;
  return data as T;
}

export const SHOP_MEDIA_BUCKET = "shop-media";

export type ShopCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  display_order: number;
  status: string;
  products_count?: number;
};

export type ShopProduct = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description?: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  images: string[];
  sku?: string | null;
  stock: number;
  stock_unlimited: boolean;
  status?: string;
  is_featured: boolean;
  display_order?: number;
  meta_title?: string | null;
  meta_description?: string | null;
  category_id: string | null;
  product_link?: string | null;
  category_name?: string | null;
  created_at?: string;
};

export type ShopCartLine = {
  product_id: string;
  title: string;
  slug: string;
  price: number;
  image: string | null;
  stock: number;
  stock_unlimited: boolean;
  quantity: number;
};

export type ShopOrderItem = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  quantity: number;
  total: number;
};

export type ShopOrder = {
  id: string;
  status: string;
  total_amount: number;
  discount_amount: number;
  currency: string;
  items_count: number;
  shipping_address: Record<string, string> | null;
  customer_note: string | null;
  tracking_code: string | null;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  payment_id: string | null;
  ref_id: string | null;
  items: ShopOrderItem[];
  user_id?: string;
  user_name?: string | null;
  user_email?: string | null;
};

export type ShopCoupon = {
  id: string;
  code: string;
  title: string | null;
  discount_type: string;
  discount_value: number;
  min_purchase: number;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار پرداخت",
  paid: "پرداخت‌شده",
  cancelled: "لغو شده",
  refunded: "بازگشت وجه",
};

export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  published: "منتشرشده",
  archived: "بایگانی",
};
