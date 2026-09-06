-- =====================================================================
-- افزودن «لینک محصول» و ارسال خودکار آن پس از پرداخت (کاملاً افزایشی)
-- هیچ شیء موجودی حذف یا تغییر نام داده نمی‌شود.
-- =====================================================================

ALTER TABLE public.shop_products ADD COLUMN IF NOT EXISTS product_link text;

-- جدول ثبت ارسال لینک سفارش (جلوگیری از ارسال تکراری)
CREATE TABLE IF NOT EXISTS public.shop_order_link_deliveries (
  order_id uuid PRIMARY KEY REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent',
  links_count int NOT NULL DEFAULT 0,
  mobile_masked text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_order_link_deliveries ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.shop_order_link_deliveries TO service_role;

-- لیست محصولات ادمین + ستون لینک محصول
CREATE OR REPLACE FUNCTION public.admin_shop_list_products(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.display_order, t.created_at DESC)
    FROM (
      SELECT p.id, p.title, p.slug, p.summary, p.description, p.price, p.compare_at_price,
             p.currency, p.images, p.sku, p.stock, p.stock_unlimited, p.status, p.is_featured,
             p.display_order, p.meta_title, p.meta_description, p.category_id, p.created_at,
             p.product_link,
             c.name AS category_name
      FROM public.shop_products p
      LEFT JOIN public.shop_categories c ON c.id = p.category_id
      WHERE p.deleted_at IS NULL
        AND (p_status IS NULL OR p_status = '' OR p.status = p_status)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (p_search IS NULL OR p_search = '' OR p.title ILIKE '%' || p_search || '%'
             OR COALESCE(p.sku,'') ILIKE '%' || p_search || '%')
    ) t
  ), '[]'::jsonb);
END;
$$;

-- ذخیره لینک محصول (جدا از admin_save_product تا امضای آن دست‌نخورده بماند)
CREATE OR REPLACE FUNCTION public.admin_save_product_link(p_id uuid, p_product_link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.shop_products
     SET product_link = NULLIF(btrim(COALESCE(p_product_link, '')), ''),
         updated_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_product_link(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_product_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_product_link(uuid, text) TO service_role;
