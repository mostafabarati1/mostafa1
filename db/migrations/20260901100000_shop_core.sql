-- ماژول فروشگاه «همراه استخدام» — کاملاً افزایشی (additive) و idempotent
-- هیچ جدول/ستون/تابع موجودی حذف یا بازنویسی نمی‌شود.
-- اجرا: به‌صورت دستی روی پروژه Supabase (SQL editor یا supabase db push).
--
-- یادداشت طراحی پرداخت (گام ۰):
--   تابع موجود public.create_payment_intent امضای p_plan_id (اجباری) دارد و برای سفارش فروشگاه
--   قابل استفاده نیست؛ بنابراین نسخه افزایشی shop_create_payment_intent ساخته شده است.
--   چون بدنه finalize_gateway_payment در ریپو موجود نیست و NULL-safe بودن آن قابل تضمین نیست،
--   مسیر نهایی‌سازی فروشگاه مستقل و افزایشی پیاده شده است:
--     shop_finalize_payment(...)  ← فقط روی ردیف‌های payments با gateway_meta->>'entity_type' = 'shop_order'
--   کال‌بک عمومی موجود (payment.callback.ts) دست‌نخورده می‌ماند؛ اگر آن مسیر پرداخت را تسویه کرده باشد،
--   shop_confirm_order_payment صرفاً سفارش را paid می‌کند (idempotent).

-- =====================================================================
-- ۱) جداول
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.shop_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  parent_id uuid REFERENCES public.shop_categories(id) ON DELETE SET NULL,
  display_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text,
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value bigint NOT NULL DEFAULT 0,
  min_purchase bigint NOT NULL DEFAULT 0,
  max_uses int,
  used_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.shop_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  summary text,
  description text,
  price bigint NOT NULL DEFAULT 0,
  compare_at_price bigint,
  currency text NOT NULL DEFAULT 'IRT',
  images text[] NOT NULL DEFAULT '{}',
  sku text,
  stock int NOT NULL DEFAULT 0,
  stock_unlimited boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  is_featured boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  meta_title text,
  meta_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  total_amount bigint NOT NULL DEFAULT 0,
  discount_amount bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IRT',
  items_count int NOT NULL DEFAULT 0,
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_note text,
  tracking_code text,
  coupon_id uuid REFERENCES public.shop_coupons(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.shop_products(id) ON DELETE SET NULL,
  title_snapshot text NOT NULL,
  price_snapshot bigint NOT NULL DEFAULT 0,
  image_snapshot text,
  quantity int NOT NULL DEFAULT 1,
  total bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.shop_carts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_categories_slug_idx ON public.shop_categories (slug);
CREATE INDEX IF NOT EXISTS shop_products_slug_idx ON public.shop_products (slug);
CREATE INDEX IF NOT EXISTS shop_products_status_order_idx ON public.shop_products (status, display_order);
CREATE INDEX IF NOT EXISTS shop_orders_user_created_idx ON public.shop_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shop_order_items_order_idx ON public.shop_order_items (order_id);
CREATE INDEX IF NOT EXISTS shop_coupons_code_idx ON public.shop_coupons (code);

-- =====================================================================
-- ۲) دسترسی Data API و RLS
-- =====================================================================

GRANT SELECT ON public.shop_categories TO anon, authenticated;
GRANT SELECT ON public.shop_products TO anon, authenticated;
GRANT SELECT ON public.shop_orders TO authenticated;
GRANT SELECT ON public.shop_order_items TO authenticated;
GRANT SELECT ON public.shop_carts TO authenticated;
GRANT SELECT ON public.shop_coupons TO authenticated;
GRANT ALL ON public.shop_categories, public.shop_products, public.shop_orders,
  public.shop_order_items, public.shop_carts, public.shop_coupons TO service_role;

ALTER TABLE public.shop_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_categories_public_read" ON public.shop_categories;
CREATE POLICY "shop_categories_public_read" ON public.shop_categories
  FOR SELECT TO anon, authenticated
  USING (status = 'active' OR public.is_admin());

DROP POLICY IF EXISTS "shop_products_public_read" ON public.shop_products;
CREATE POLICY "shop_products_public_read" ON public.shop_products
  FOR SELECT TO anon, authenticated
  USING ((status = 'published' AND deleted_at IS NULL) OR public.is_admin());

DROP POLICY IF EXISTS "shop_orders_owner_read" ON public.shop_orders;
CREATE POLICY "shop_orders_owner_read" ON public.shop_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "shop_order_items_owner_read" ON public.shop_order_items;
CREATE POLICY "shop_order_items_owner_read" ON public.shop_order_items
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.shop_orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "shop_carts_owner_read" ON public.shop_carts;
CREATE POLICY "shop_carts_owner_read" ON public.shop_carts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "shop_coupons_admin_read" ON public.shop_coupons;
CREATE POLICY "shop_coupons_admin_read" ON public.shop_coupons
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- هیچ سیاست INSERT/UPDATE/DELETE برای کلاینت تعریف نمی‌شود؛ همه نوشتن‌ها از RPC امن.

-- =====================================================================
-- ۳) باکت تصاویر فروشگاه (هم‌سبک question-media)
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-media',
  'shop-media',
  true,
  5242880,
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "shop_media_public_read" ON storage.objects;
CREATE POLICY "shop_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'shop-media');

DROP POLICY IF EXISTS "shop_media_admin_insert" ON storage.objects;
CREATE POLICY "shop_media_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shop-media' AND public.is_admin());

DROP POLICY IF EXISTS "shop_media_admin_update" ON storage.objects;
CREATE POLICY "shop_media_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'shop-media' AND public.is_admin())
  WITH CHECK (bucket_id = 'shop-media' AND public.is_admin());

DROP POLICY IF EXISTS "shop_media_admin_delete" ON storage.objects;
CREATE POLICY "shop_media_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'shop-media' AND public.is_admin());

-- =====================================================================
-- ۴) توابع عمومی (استورفرانت)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.shop_list_categories()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.display_order, c.name), '[]'::jsonb)
  FROM (
    SELECT id, name, slug, description, parent_id, display_order, status
    FROM public.shop_categories
    WHERE status = 'active'
  ) c;
$$;

CREATE OR REPLACE FUNCTION public.shop_list_products(
  p_search text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int; v_items jsonb;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.shop_products p
  WHERE p.status = 'published' AND p.deleted_at IS NULL
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_search IS NULL OR p_search = '' OR p.title ILIKE '%' || p_search || '%'
         OR COALESCE(p.summary,'') ILIKE '%' || p_search || '%');

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_items
  FROM (
    SELECT p.id, p.title, p.slug, p.summary, p.price, p.compare_at_price, p.currency,
           p.images, p.stock, p.stock_unlimited, p.is_featured, p.category_id,
           c.name AS category_name
    FROM public.shop_products p
    LEFT JOIN public.shop_categories c ON c.id = p.category_id
    WHERE p.status = 'published' AND p.deleted_at IS NULL
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_search IS NULL OR p_search = '' OR p.title ILIKE '%' || p_search || '%'
           OR COALESCE(p.summary,'') ILIKE '%' || p_search || '%')
    ORDER BY p.is_featured DESC, p.display_order, p.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 24), 60))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  ) t;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_get_product(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  SELECT row_to_json(t)::jsonb INTO v
  FROM (
    SELECT p.id, p.title, p.slug, p.summary, p.description, p.price, p.compare_at_price,
           p.currency, p.images, p.sku, p.stock, p.stock_unlimited, p.is_featured,
           p.meta_title, p.meta_description, p.category_id, c.name AS category_name
    FROM public.shop_products p
    LEFT JOIN public.shop_categories c ON c.id = p.category_id
    WHERE p.slug = p_slug AND p.status = 'published' AND p.deleted_at IS NULL
  ) t;
  IF v IS NULL THEN RAISE EXCEPTION 'product not found'; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_validate_coupon(p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.shop_coupons%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.shop_coupons WHERE lower(code) = lower(trim(p_code));
  IF NOT FOUND OR NOT c.is_active THEN RAISE EXCEPTION 'coupon invalid'; END IF;
  IF c.starts_at IS NOT NULL AND now() < c.starts_at THEN RAISE EXCEPTION 'coupon invalid'; END IF;
  IF c.expires_at IS NOT NULL AND now() > c.expires_at THEN RAISE EXCEPTION 'coupon expired'; END IF;
  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN RAISE EXCEPTION 'coupon exhausted'; END IF;
  RETURN jsonb_build_object(
    'id', c.id, 'code', c.code, 'title', c.title,
    'discount_type', c.discount_type, 'discount_value', c.discount_value,
    'min_purchase', c.min_purchase
  );
END;
$$;

-- سبد خرید ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shop_cart_get()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT items INTO v_items FROM public.shop_carts WHERE user_id = auth.uid();
  v_items := COALESCE(v_items, '[]'::jsonb);

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'product_id', p.id,
      'title', p.title,
      'slug', p.slug,
      'price', p.price,
      'image', COALESCE(p.images[1], NULL),
      'stock', p.stock,
      'stock_unlimited', p.stock_unlimited,
      'quantity', GREATEST(1, (i->>'quantity')::int)
    ))
    FROM jsonb_array_elements(v_items) i
    JOIN public.shop_products p ON p.id = (i->>'product_id')::uuid
    WHERE p.status = 'published' AND p.deleted_at IS NULL
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_cart_add(p_product_id uuid, p_quantity int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_items jsonb; v_found boolean := false; v_new jsonb := '[]'::jsonb; i jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shop_products WHERE id = p_product_id
                 AND status = 'published' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  INSERT INTO public.shop_carts (user_id, items) VALUES (auth.uid(), '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT items INTO v_items FROM public.shop_carts WHERE user_id = auth.uid();
  FOR i IN SELECT * FROM jsonb_array_elements(COALESCE(v_items, '[]'::jsonb)) LOOP
    IF (i->>'product_id')::uuid = p_product_id THEN
      v_found := true;
      v_new := v_new || jsonb_build_array(jsonb_build_object(
        'product_id', p_product_id,
        'quantity', GREATEST(1, (i->>'quantity')::int + GREATEST(1, COALESCE(p_quantity, 1)))));
    ELSE
      v_new := v_new || jsonb_build_array(i);
    END IF;
  END LOOP;
  IF NOT v_found THEN
    v_new := v_new || jsonb_build_array(jsonb_build_object(
      'product_id', p_product_id, 'quantity', GREATEST(1, COALESCE(p_quantity, 1))));
  END IF;

  UPDATE public.shop_carts SET items = v_new, updated_at = now() WHERE user_id = auth.uid();
  RETURN public.shop_cart_get();
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_cart_set_qty(p_product_id uuid, p_quantity int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_items jsonb; v_new jsonb := '[]'::jsonb; i jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT items INTO v_items FROM public.shop_carts WHERE user_id = auth.uid();
  FOR i IN SELECT * FROM jsonb_array_elements(COALESCE(v_items, '[]'::jsonb)) LOOP
    IF (i->>'product_id')::uuid = p_product_id THEN
      IF COALESCE(p_quantity, 0) > 0 THEN
        v_new := v_new || jsonb_build_array(jsonb_build_object(
          'product_id', p_product_id, 'quantity', p_quantity));
      END IF;
    ELSE
      v_new := v_new || jsonb_build_array(i);
    END IF;
  END LOOP;
  INSERT INTO public.shop_carts (user_id, items) VALUES (auth.uid(), v_new)
  ON CONFLICT (user_id) DO UPDATE SET items = EXCLUDED.items, updated_at = now();
  RETURN public.shop_cart_get();
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_cart_clear()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.shop_carts (user_id, items) VALUES (auth.uid(), '[]'::jsonb)
  ON CONFLICT (user_id) DO UPDATE SET items = '[]'::jsonb, updated_at = now();
  RETURN '[]'::jsonb;
END;
$$;

-- =====================================================================
-- ۵) ثبت سفارش و پرداخت
-- =====================================================================

CREATE OR REPLACE FUNCTION public.shop_place_order(
  p_items jsonb,
  p_shipping jsonb,
  p_coupon_code text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  i jsonb; p public.shop_products%ROWTYPE; v_qty int;
  v_subtotal bigint := 0; v_discount bigint := 0; v_count int := 0;
  v_order_id uuid; c public.shop_coupons%ROWTYPE; v_coupon_id uuid := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'cart empty'; END IF;

  INSERT INTO public.shop_orders (user_id, status, shipping_address, customer_note, currency)
  VALUES (v_uid, 'pending', COALESCE(p_shipping, '{}'::jsonb), p_note, 'IRT')
  RETURNING id INTO v_order_id;

  FOR i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(1, COALESCE((i->>'quantity')::int, 1));
    SELECT * INTO p FROM public.shop_products
      WHERE id = (i->>'product_id')::uuid AND status = 'published' AND deleted_at IS NULL
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;
    IF NOT p.stock_unlimited AND p.stock < v_qty THEN RAISE EXCEPTION 'insufficient stock'; END IF;

    IF NOT p.stock_unlimited THEN
      UPDATE public.shop_products SET stock = stock - v_qty, updated_at = now() WHERE id = p.id;
    END IF;

    INSERT INTO public.shop_order_items
      (order_id, product_id, title_snapshot, price_snapshot, image_snapshot, quantity, total)
    VALUES (v_order_id, p.id, p.title, p.price, p.images[1], v_qty, p.price * v_qty);

    v_subtotal := v_subtotal + (p.price * v_qty);
    v_count := v_count + v_qty;
  END LOOP;

  IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) <> '' THEN
    SELECT * INTO c FROM public.shop_coupons WHERE lower(code) = lower(trim(p_coupon_code)) FOR UPDATE;
    IF NOT FOUND OR NOT c.is_active THEN RAISE EXCEPTION 'coupon invalid'; END IF;
    IF c.starts_at IS NOT NULL AND now() < c.starts_at THEN RAISE EXCEPTION 'coupon invalid'; END IF;
    IF c.expires_at IS NOT NULL AND now() > c.expires_at THEN RAISE EXCEPTION 'coupon expired'; END IF;
    IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN RAISE EXCEPTION 'coupon exhausted'; END IF;
    IF v_subtotal < c.min_purchase THEN RAISE EXCEPTION 'coupon min purchase'; END IF;

    v_discount := CASE WHEN c.discount_type = 'percent'
      THEN (v_subtotal * c.discount_value) / 100
      ELSE c.discount_value END;
    v_discount := LEAST(GREATEST(v_discount, 0), v_subtotal);
    v_coupon_id := c.id;
    UPDATE public.shop_coupons SET used_count = used_count + 1 WHERE id = c.id;
  END IF;

  UPDATE public.shop_orders
    SET total_amount = v_subtotal - v_discount,
        discount_amount = v_discount,
        items_count = v_count,
        coupon_id = v_coupon_id
  WHERE id = v_order_id;

  UPDATE public.shop_carts SET items = '[]'::jsonb, updated_at = now() WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'total_amount', v_subtotal - v_discount,
    'discount_amount', v_discount,
    'status', 'pending'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_create_payment_intent(p_order_id uuid, p_gateway text DEFAULT 'zarinpal')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.shop_orders%ROWTYPE; v_payment_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO o FROM public.shop_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.user_id <> auth.uid() THEN RAISE EXCEPTION 'order forbidden'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'order not payable'; END IF;
  IF o.total_amount <= 0 THEN RAISE EXCEPTION 'order not payable'; END IF;

  INSERT INTO public.payments (user_id, amount, currency, gateway, status, plan_id, subscription_id, gateway_meta)
  VALUES (
    o.user_id, o.total_amount, COALESCE(o.currency, 'IRT'), COALESCE(p_gateway, 'zarinpal'),
    'pending', NULL, NULL,
    jsonb_build_object('entity_type', 'shop_order', 'order_id', o.id)
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'amount', o.total_amount,
    'currency', COALESCE(o.currency, 'IRT')
  );
END;
$$;

-- نهایی‌سازی افزایشی مخصوص فروشگاه (فقط ردیف‌های payments متعلق به سفارش فروشگاه).
CREATE OR REPLACE FUNCTION public.shop_finalize_payment(
  p_payment_id uuid,
  p_ref_id text,
  p_amount bigint DEFAULT NULL,
  p_card_pan text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.payments%ROWTYPE;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF COALESCE(pay.gateway_meta->>'entity_type', '') <> 'shop_order' THEN
    RAISE EXCEPTION 'payment forbidden';
  END IF;
  IF auth.uid() IS NULL OR (pay.user_id <> auth.uid() AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'payment forbidden';
  END IF;

  IF pay.status IN ('paid', 'verified', 'completed') THEN
    RETURN jsonb_build_object('status', pay.status, 'ref_id', pay.ref_id, 'idempotent', true);
  END IF;

  UPDATE public.payments
    SET status = 'paid',
        ref_id = COALESCE(p_ref_id, ref_id),
        card_pan = COALESCE(p_card_pan, card_pan),
        amount = COALESCE(p_amount, amount),
        paid_at = COALESCE(paid_at, now()),
        verified_at = COALESCE(verified_at, now()),
        updated_at = now()
  WHERE id = p_payment_id;

  RETURN jsonb_build_object('status', 'paid', 'ref_id', p_ref_id, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_confirm_order_payment(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.shop_orders%ROWTYPE; pay public.payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO o FROM public.shop_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'order forbidden'; END IF;

  IF o.status = 'paid' THEN
    RETURN jsonb_build_object('status', 'paid', 'idempotent', true);
  END IF;

  SELECT * INTO pay FROM public.payments
   WHERE gateway_meta->>'order_id' = o.id::text
     AND status IN ('paid', 'verified', 'completed')
   ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', o.status, 'idempotent', false);
  END IF;

  UPDATE public.shop_orders
    SET status = 'paid', paid_at = COALESCE(paid_at, now()), payment_id = pay.id
  WHERE id = o.id;

  RETURN jsonb_build_object('status', 'paid', 'idempotent', false, 'ref_id', pay.ref_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_my_orders()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- مصالحه idempotent: سفارش‌های در انتظار که پرداختشان تسویه شده، paid می‌شوند.
  FOR r IN SELECT id FROM public.shop_orders WHERE user_id = v_uid AND status = 'pending' LOOP
    PERFORM public.shop_confirm_order_payment(r.id);
  END LOOP;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
    FROM (
      SELECT o.id, o.status, o.total_amount, o.discount_amount, o.currency, o.items_count,
             o.shipping_address, o.customer_note, o.tracking_code, o.created_at, o.paid_at,
             o.cancelled_at, o.payment_id, pa.ref_id,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'id', it.id, 'title', it.title_snapshot, 'price', it.price_snapshot,
                 'image', it.image_snapshot, 'quantity', it.quantity, 'total', it.total))
               FROM public.shop_order_items it WHERE it.order_id = o.id), '[]'::jsonb) AS items
      FROM public.shop_orders o
      LEFT JOIN public.payments pa ON pa.id = o.payment_id
      WHERE o.user_id = v_uid
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_cancel_order(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.shop_orders%ROWTYPE; it record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO o FROM public.shop_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'order forbidden'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'order not cancellable'; END IF;

  FOR it IN SELECT product_id, quantity FROM public.shop_order_items WHERE order_id = o.id LOOP
    IF it.product_id IS NOT NULL THEN
      UPDATE public.shop_products SET stock = stock + it.quantity, updated_at = now()
       WHERE id = it.product_id AND stock_unlimited = false;
    END IF;
  END LOOP;

  IF o.coupon_id IS NOT NULL THEN
    UPDATE public.shop_coupons SET used_count = GREATEST(0, used_count - 1) WHERE id = o.coupon_id;
  END IF;

  UPDATE public.shop_orders SET status = 'cancelled', cancelled_at = now() WHERE id = o.id;
  PERFORM public.log_admin_action('shop_cancel_order', 'shop_order', o.id::text,
    jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;

-- =====================================================================
-- ۶) توابع اداری
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_shop_list_categories()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.display_order, t.name)
    FROM (
      SELECT c.id, c.name, c.slug, c.description, c.parent_id, c.display_order, c.status,
             (SELECT count(*) FROM public.shop_products p
               WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS products_count
      FROM public.shop_categories c
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_shop_category(
  p_id uuid,
  p_name text,
  p_slug text,
  p_description text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL,
  p_display_order int DEFAULT 0,
  p_status text DEFAULT 'active',
  p_reason text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.shop_categories (name, slug, description, parent_id, display_order, status)
    VALUES (p_name, p_slug, p_description, p_parent_id, COALESCE(p_display_order, 0), COALESCE(p_status, 'active'))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.shop_categories
       SET name = p_name, slug = p_slug, description = p_description, parent_id = p_parent_id,
           display_order = COALESCE(p_display_order, 0), status = COALESCE(p_status, 'active'),
           updated_at = now()
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'category not found'; END IF;
  END IF;
  PERFORM public.log_admin_action('save_shop_category', 'shop_category', v_id::text,
    jsonb_build_object('reason', p_reason, 'name', p_name));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_shop_category(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.shop_products WHERE category_id = p_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'category has products';
  END IF;
  DELETE FROM public.shop_categories WHERE id = p_id;
  PERFORM public.log_admin_action('delete_shop_category', 'shop_category', p_id::text,
    jsonb_build_object('reason', p_reason));
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_save_product(
  p_id uuid,
  p_title text,
  p_slug text,
  p_category_id uuid DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_price bigint DEFAULT 0,
  p_compare_at_price bigint DEFAULT NULL,
  p_images text[] DEFAULT '{}',
  p_sku text DEFAULT NULL,
  p_stock int DEFAULT 0,
  p_stock_unlimited boolean DEFAULT false,
  p_status text DEFAULT 'draft',
  p_is_featured boolean DEFAULT false,
  p_display_order int DEFAULT 0,
  p_meta_title text DEFAULT NULL,
  p_meta_description text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.shop_products (title, slug, category_id, summary, description, price,
      compare_at_price, images, sku, stock, stock_unlimited, status, is_featured, display_order,
      meta_title, meta_description)
    VALUES (p_title, p_slug, p_category_id, p_summary, p_description, COALESCE(p_price, 0),
      p_compare_at_price, COALESCE(p_images, '{}'), p_sku, COALESCE(p_stock, 0),
      COALESCE(p_stock_unlimited, false), COALESCE(p_status, 'draft'),
      COALESCE(p_is_featured, false), COALESCE(p_display_order, 0), p_meta_title, p_meta_description)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.shop_products
       SET title = p_title, slug = p_slug, category_id = p_category_id, summary = p_summary,
           description = p_description, price = COALESCE(p_price, 0),
           compare_at_price = p_compare_at_price, images = COALESCE(p_images, '{}'),
           sku = p_sku, stock = COALESCE(p_stock, 0),
           stock_unlimited = COALESCE(p_stock_unlimited, false),
           status = COALESCE(p_status, 'draft'), is_featured = COALESCE(p_is_featured, false),
           display_order = COALESCE(p_display_order, 0), meta_title = p_meta_title,
           meta_description = p_meta_description, updated_at = now()
     WHERE id = p_id AND deleted_at IS NULL
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'product not found'; END IF;
  END IF;
  PERFORM public.log_admin_action('save_shop_product', 'shop_product', v_id::text,
    jsonb_build_object('reason', p_reason, 'title', p_title, 'status', p_status));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_product(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.shop_products
     SET deleted_at = now(), status = 'archived', updated_at = now()
   WHERE id = p_id;
  PERFORM public.log_admin_action('delete_shop_product', 'shop_product', p_id::text,
    jsonb_build_object('reason', p_reason, 'soft_delete', true));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_shop_list_orders(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
    FROM (
      SELECT o.id, o.status, o.total_amount, o.discount_amount, o.currency, o.items_count,
             o.shipping_address, o.customer_note, o.tracking_code, o.created_at, o.paid_at,
             o.cancelled_at, o.payment_id, o.user_id, pa.ref_id,
             pr.full_name AS user_name, pr.email AS user_email,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'id', it.id, 'title', it.title_snapshot, 'price', it.price_snapshot,
                 'image', it.image_snapshot, 'quantity', it.quantity, 'total', it.total))
               FROM public.shop_order_items it WHERE it.order_id = o.id), '[]'::jsonb) AS items
      FROM public.shop_orders o
      LEFT JOIN public.payments pa ON pa.id = o.payment_id
      LEFT JOIN public.profiles pr ON pr.id = o.user_id
      WHERE (p_status IS NULL OR p_status = '' OR o.status = p_status)
        AND (p_search IS NULL OR p_search = ''
             OR COALESCE(pr.full_name,'') ILIKE '%' || p_search || '%'
             OR COALESCE(pr.email,'') ILIKE '%' || p_search || '%'
             OR o.id::text ILIKE '%' || p_search || '%')
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_id uuid,
  p_status text,
  p_tracking_code text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.shop_orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO o FROM public.shop_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  -- مسیرهای مجاز تغییر وضعیت
  IF NOT (
    (o.status = 'pending' AND p_status IN ('paid', 'cancelled'))
    OR (o.status = 'paid' AND p_status IN ('refunded', 'cancelled'))
    OR (o.status = p_status)
  ) THEN
    RAISE EXCEPTION 'order status transition not allowed';
  END IF;

  IF p_status = 'cancelled' AND o.status = 'pending' THEN
    PERFORM public.shop_cancel_order(p_order_id, p_reason);
  ELSE
    UPDATE public.shop_orders
       SET status = p_status,
           tracking_code = COALESCE(NULLIF(trim(COALESCE(p_tracking_code, '')), ''), tracking_code),
           paid_at = CASE WHEN p_status = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
           cancelled_at = CASE WHEN p_status = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END
     WHERE id = p_order_id;
  END IF;

  PERFORM public.log_admin_action('update_shop_order_status', 'shop_order', p_order_id::text,
    jsonb_build_object('reason', p_reason, 'from', o.status, 'to', p_status,
                       'tracking_code', p_tracking_code));
  RETURN jsonb_build_object('status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_shop_list_coupons()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) FROM public.shop_coupons c
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_coupon(
  p_id uuid,
  p_code text,
  p_title text DEFAULT NULL,
  p_discount_type text DEFAULT 'percent',
  p_discount_value bigint DEFAULT 0,
  p_min_purchase bigint DEFAULT 0,
  p_max_uses int DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_starts_at timestamptz DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.shop_coupons (code, title, discount_type, discount_value, min_purchase,
      max_uses, is_active, starts_at, expires_at)
    VALUES (upper(trim(p_code)), p_title, COALESCE(p_discount_type, 'percent'),
      COALESCE(p_discount_value, 0), COALESCE(p_min_purchase, 0), p_max_uses,
      COALESCE(p_is_active, true), p_starts_at, p_expires_at)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.shop_coupons
       SET code = upper(trim(p_code)), title = p_title,
           discount_type = COALESCE(p_discount_type, 'percent'),
           discount_value = COALESCE(p_discount_value, 0),
           min_purchase = COALESCE(p_min_purchase, 0), max_uses = p_max_uses,
           is_active = COALESCE(p_is_active, true), starts_at = p_starts_at, expires_at = p_expires_at
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'coupon not found'; END IF;
  END IF;
  PERFORM public.log_admin_action('save_shop_coupon', 'shop_coupon', v_id::text,
    jsonb_build_object('reason', p_reason, 'code', p_code));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_coupon(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.shop_coupons WHERE id = p_id;
  PERFORM public.log_admin_action('delete_shop_coupon', 'shop_coupon', p_id::text,
    jsonb_build_object('reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_shop_overview(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from timestamptz := now() - (GREATEST(1, COALESCE(p_days, 30)) || ' days')::interval;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'products_count', (SELECT count(*) FROM public.shop_products WHERE deleted_at IS NULL),
    'published_count', (SELECT count(*) FROM public.shop_products
                         WHERE deleted_at IS NULL AND status = 'published'),
    'low_stock_count', (SELECT count(*) FROM public.shop_products
                         WHERE deleted_at IS NULL AND stock_unlimited = false AND stock <= 3),
    'orders_count', (SELECT count(*) FROM public.shop_orders WHERE created_at >= v_from),
    'pending_orders', (SELECT count(*) FROM public.shop_orders WHERE status = 'pending'),
    'revenue', (SELECT COALESCE(sum(total_amount), 0) FROM public.shop_orders
                 WHERE status = 'paid' AND created_at >= v_from),
    'top_products', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT it.title_snapshot AS title, sum(it.quantity)::int AS quantity,
               sum(it.total)::bigint AS revenue
        FROM public.shop_order_items it
        JOIN public.shop_orders o ON o.id = it.order_id
        WHERE o.status = 'paid' AND o.created_at >= v_from
        GROUP BY it.title_snapshot
        ORDER BY sum(it.quantity) DESC
        LIMIT 5
      ) t), '[]'::jsonb)
  );
END;
$$;

-- =====================================================================
-- ۷) GRANT EXECUTE
-- =====================================================================

GRANT EXECUTE ON FUNCTION public.shop_list_categories() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_list_products(text, uuid, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_get_product(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_validate_coupon(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_cart_get() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_cart_add(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_cart_set_qty(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_cart_clear() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_place_order(jsonb, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_create_payment_intent(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_finalize_payment(uuid, text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_confirm_order_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_my_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_cancel_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_shop_list_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_shop_category(uuid, text, text, text, uuid, int, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_shop_category(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_shop_list_products(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_product(uuid, text, text, uuid, text, text, bigint, bigint, text[], text, int, boolean, text, boolean, int, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_product(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_shop_list_orders(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_shop_list_coupons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_coupon(uuid, text, text, text, bigint, bigint, int, boolean, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_coupon(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_shop_overview(int) TO authenticated;

-- =====================================================================
-- ۸) داده نمونه (idempotent)
-- =====================================================================

INSERT INTO public.shop_categories (name, slug, description, display_order, status) VALUES
  ('کتاب', 'books', 'کتاب‌های آمادگی آزمون‌های استخدامی', 1, 'active'),
  ('پکیج آزمون', 'exam-packs', 'پکیج‌های آزمون آزمایشی', 2, 'active'),
  ('جزوه', 'notes', 'جزوه‌ها و خلاصه‌های درسی', 3, 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.shop_products (category_id, title, slug, summary, price, stock, status)
SELECT c.id, v.title, v.slug, v.summary, v.price, v.stock, 'draft'
FROM (VALUES
  ('books', 'کتاب جامع آزمون‌های استخدامی', 'book-comprehensive', 'مرور کامل مباحث عمومی و تخصصی', 250000::bigint, 20),
  ('exam-packs', 'پکیج ۱۰ آزمون آزمایشی', 'pack-10-mock-exams', 'ده آزمون شبیه‌سازی‌شده با پاسخ تشریحی', 180000::bigint, 100),
  ('notes', 'جزوه ریاضی و آمار', 'notes-math-stats', 'خلاصه نکات کلیدی ریاضی و آمار', 90000::bigint, 50)
) AS v(cat_slug, title, slug, summary, price, stock)
JOIN public.shop_categories c ON c.slug = v.cat_slug
ON CONFLICT (slug) DO NOTHING;
