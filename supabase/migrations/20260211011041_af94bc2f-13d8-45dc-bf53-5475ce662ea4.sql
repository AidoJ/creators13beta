
-- ============================================
-- 13 CREATORS — FULL DATABASE FOUNDATION
-- ============================================

-- 1. ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('trainer', 'practitioner', 'trainee', 'client', 'community_participant', 'gamer');
CREATE TYPE public.subscription_tier AS ENUM ('wren', 'robin', 'falcon', 'owl');
CREATE TYPE public.subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing', 'incomplete');
CREATE TYPE public.enrollment_step AS ENUM ('plan_selected', 'signed_up', 'payment_complete', 'photos_uploaded', 'booking_made', 'complete');
CREATE TYPE public.content_type AS ENUM ('video', 'text', 'audio', 'photo');
CREATE TYPE public.assessment_type AS ENUM ('quiz', 'test', 'practical');
CREATE TYPE public.case_study_status AS ENUM ('draft', 'submitted', 'approved', 'revision_requested');
CREATE TYPE public.product_type AS ENUM ('physical', 'digital');
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded');

-- 2. USER ROLES TABLE (must come first for has_role function)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Trainers can manage all roles" ON public.user_roles FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 3. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  gender TEXT,
  height_cm NUMERIC,
  shoe_size TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  medical_history TEXT,
  avatar_url TEXT,
  enrollment_step public.enrollment_step DEFAULT 'plan_selected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Trainers can view all profiles" ON public.profiles FOR SELECT USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 4. SUBSCRIPTIONS TABLE
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tier public.subscription_tier NOT NULL DEFAULT 'wren',
  status public.subscription_status NOT NULL DEFAULT 'active',
  billing_period TEXT DEFAULT 'monthly',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  payment_method TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscription" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subscription" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Trainers can view all subscriptions" ON public.subscriptions FOR SELECT USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 5. CREATOR TYPE PROFILES
CREATE TABLE public.creator_type_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  primary_type TEXT,
  secondary_type TEXT,
  profiling_data JSONB DEFAULT '{}',
  profiled_by UUID REFERENCES auth.users(id),
  profiled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_type_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own creator type" ON public.creator_type_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Practitioners can view assigned client types" ON public.creator_type_profiles FOR SELECT USING (
  public.has_role(auth.uid(), 'practitioner') OR public.has_role(auth.uid(), 'trainee')
);
CREATE POLICY "Practitioners can insert creator types" ON public.creator_type_profiles FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'practitioner') OR public.has_role(auth.uid(), 'trainee') OR public.has_role(auth.uid(), 'trainer')
);
CREATE POLICY "Practitioners can update creator types" ON public.creator_type_profiles FOR UPDATE USING (
  public.has_role(auth.uid(), 'practitioner') OR public.has_role(auth.uid(), 'trainee') OR public.has_role(auth.uid(), 'trainer')
);

-- 6. CLIENT-PRACTITIONER RELATIONSHIPS
CREATE TABLE public.client_practitioner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  practitioner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN DEFAULT true,
  UNIQUE (client_id, practitioner_id)
);
ALTER TABLE public.client_practitioner ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can view own clients" ON public.client_practitioner FOR SELECT USING (
  auth.uid() = practitioner_id OR auth.uid() = client_id
);
CREATE POLICY "Trainers can manage all assignments" ON public.client_practitioner FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 7. PROFILING PHOTOS
CREATE TABLE public.profiling_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  photo_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiling_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own photos" ON public.profiling_photos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upload own photos" ON public.profiling_photos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own photos" ON public.profiling_photos FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Practitioners can view client photos" ON public.profiling_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.client_practitioner WHERE client_id = profiling_photos.user_id AND practitioner_id = auth.uid() AND active = true)
);
CREATE POLICY "Trainers can view all photos" ON public.profiling_photos FOR SELECT USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 8. BOOKINGS
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  practitioner_id UUID REFERENCES auth.users(id),
  calendly_event_id TEXT,
  zoom_link TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INT DEFAULT 60,
  status TEXT DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT USING (
  auth.uid() = client_id OR auth.uid() = practitioner_id
);
CREATE POLICY "Users can create own bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Trainers can manage all bookings" ON public.bookings FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 9. LMS — COURSES
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  sort_order INT DEFAULT 0,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view published courses" ON public.courses FOR SELECT USING (
  published = true AND (
    public.has_role(auth.uid(), 'trainee') OR public.has_role(auth.uid(), 'practitioner') OR public.has_role(auth.uid(), 'trainer')
  )
);
CREATE POLICY "Trainers can manage courses" ON public.courses FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 10. LMS — MODULES
CREATE TABLE public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view modules" ON public.modules FOR SELECT USING (
  public.has_role(auth.uid(), 'trainee') OR public.has_role(auth.uid(), 'practitioner') OR public.has_role(auth.uid(), 'trainer')
);
CREATE POLICY "Trainers can manage modules" ON public.modules FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 11. LMS — LESSONS
CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES public.modules(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  content_type public.content_type DEFAULT 'text',
  media_url TEXT,
  duration_minutes INT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view lessons" ON public.lessons FOR SELECT USING (
  public.has_role(auth.uid(), 'trainee') OR public.has_role(auth.uid(), 'practitioner') OR public.has_role(auth.uid(), 'trainer')
);
CREATE POLICY "Trainers can manage lessons" ON public.lessons FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 12. LMS — ASSESSMENTS
CREATE TABLE public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES public.modules(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assessment_type public.assessment_type DEFAULT 'quiz',
  questions JSONB DEFAULT '[]',
  pass_percentage INT DEFAULT 70,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view assessments" ON public.assessments FOR SELECT USING (
  public.has_role(auth.uid(), 'trainee') OR public.has_role(auth.uid(), 'practitioner') OR public.has_role(auth.uid(), 'trainer')
);
CREATE POLICY "Trainers can manage assessments" ON public.assessments FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 13. LMS — PROGRESS TRACKING
CREATE TABLE public.lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own progress" ON public.lesson_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON public.lesson_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can modify own progress" ON public.lesson_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Trainers can view all progress" ON public.lesson_progress FOR SELECT USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 14. LMS — ASSESSMENT RESULTS
CREATE TABLE public.assessment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
  score INT,
  passed BOOLEAN DEFAULT false,
  answers JSONB DEFAULT '{}',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own results" ON public.assessment_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can submit results" ON public.assessment_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Trainers can view all results" ON public.assessment_results FOR SELECT USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 15. CASE STUDIES
CREATE TABLE public.case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subject_user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  creator_types_identified TEXT[],
  profiling_notes TEXT,
  photos JSONB DEFAULT '[]',
  status public.case_study_status DEFAULT 'draft',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.case_studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can view own case studies" ON public.case_studies FOR SELECT USING (auth.uid() = practitioner_id);
CREATE POLICY "Practitioners can create case studies" ON public.case_studies FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'practitioner') OR public.has_role(auth.uid(), 'trainee')
);
CREATE POLICY "Practitioners can update own case studies" ON public.case_studies FOR UPDATE USING (auth.uid() = practitioner_id);
CREATE POLICY "Trainers can manage all case studies" ON public.case_studies FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);
CREATE POLICY "Approved case studies visible to practitioners" ON public.case_studies FOR SELECT USING (
  status = 'approved' AND (public.has_role(auth.uid(), 'practitioner') OR public.has_role(auth.uid(), 'trainee'))
);

-- 16. COMMUNITY (placeholder)
CREATE TABLE public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view posts" ON public.community_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create posts" ON public.community_posts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 17. GAME (placeholder)
CREATE TABLE public.game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  game_type TEXT,
  score INT DEFAULT 0,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own scores" ON public.game_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scores" ON public.game_scores FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 18. SHOP — PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  product_type public.product_type DEFAULT 'digital',
  price_cents INT NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'AUD',
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  shopify_product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active products" ON public.products FOR SELECT USING (active = true);
CREATE POLICY "Trainers can manage products" ON public.products FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 19. SHOP — ORDERS
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status public.order_status DEFAULT 'pending',
  total_cents INT NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'AUD',
  stripe_payment_intent_id TEXT,
  shipping_address JSONB,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Trainers can manage all orders" ON public.orders FOR ALL USING (
  public.has_role(auth.uid(), 'trainer')
);

-- 20. TRIGGER: Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 21. TRIGGER: Updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_creator_type_profiles_updated_at BEFORE UPDATE ON public.creator_type_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON public.modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_case_studies_updated_at BEFORE UPDATE ON public.case_studies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_community_posts_updated_at BEFORE UPDATE ON public.community_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 22. STORAGE BUCKET for profiling photos
INSERT INTO storage.buckets (id, name, public) VALUES ('profiling-photos', 'profiling-photos', false);

CREATE POLICY "Users can upload own profiling photos" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'profiling-photos' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Users can view own profiling photos" ON storage.objects FOR SELECT USING (
  bucket_id = 'profiling-photos' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Users can delete own profiling photos" ON storage.objects FOR DELETE USING (
  bucket_id = 'profiling-photos' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Trainers can view all profiling photos" ON storage.objects FOR SELECT USING (
  bucket_id = 'profiling-photos' AND public.has_role(auth.uid(), 'trainer')
);
CREATE POLICY "Practitioners can view assigned client photos" ON storage.objects FOR SELECT USING (
  bucket_id = 'profiling-photos' AND EXISTS (
    SELECT 1 FROM public.client_practitioner
    WHERE client_id::text = (storage.foldername(name))[1]
    AND practitioner_id = auth.uid()
    AND active = true
  )
);
