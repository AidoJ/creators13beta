

# 13 Creators — Phase 1: Full Foundations, Enrollment & Practitioner Portal

## Vision
Build the complete foundational architecture matching the mind map — **Website** as the central hub connecting **LMS**, **APP (PWA)**, **Subscriptions**, **Community**, **Game**, and **Shop**. Every branch gets its database structure from day one so nothing needs rewriting as features are added.

---

## Foundations (All Branches Structured from Day One)

### Role & Tier Architecture
- **6 user roles** (users can hold multiple simultaneously): Trainer, Practitioner, Trainee, Client, Community Participant, Gamer
- **4 subscription tiers** (independent from roles): Wren (free), Robin, Falcon, Owl
- Roles and tiers stored as separate systems — either can evolve independently

### Core Database Structure
- **User profiles** — personal info, physical details (height, shoe size, DOB, gender), avatar, medical history
- **User roles** — multi-role table (a user can be Practitioner + Community Participant + Gamer simultaneously)
- **Subscriptions** — tier, billing status, Stripe IDs, payment method preferences
- **Creator Type profiles** — each user's determined Creator Type(s) and profiling data
- **Client-Practitioner relationships** — linking Practitioners/Trainees to their assigned Clients
- **Photo storage** — secure blob storage for 8 profiling photos per client (URLs stored in DB, files in Supabase Storage)
- **Booking records** — Zoom/Calendly session scheduling and history
- **LMS structure** — courses, modules, lessons (video/text/audio), assessments, case studies, progress tracking
- **Case studies** — practitioner-created profiles of individuals they've profiled, linked to LMS
- **Community structure** — placeholder tables for posts, discussions, member interactions
- **Game structure** — placeholder tables for future Golden Games features
- **Shop structure** — placeholder tables for product catalog (physical + digital), orders, fulfillment
- **Row-Level Security** on all tables with role-based access policies

---

## Phase 1 Features (What Gets Built Now)

### 1. Public Website / Landing Page
- Hero section with Creator Types branding — earthy golds, forest greens, warm naturals
- Overview of the 4 subscription tiers with pricing
- Call-to-action to enroll
- About section explaining Creator Types and the 13 forces of nature
- Navigation linking to all future sections (Community, Shop, Game shown as "Coming Soon")

### 2. Enrollment Flow (6-Step Guided Process)
1. **Plan Selection** — Choose tier with monthly/annual toggle and pricing breakdown
2. **Signup** — Email/password + full personal details (name, DOB, gender, height, shoe size, phone, address, medical history)
3. **Payment** — Stripe Checkout supporting multiple payment methods (card, EFT/bank transfer, BECS Direct Debit, PayID)
4. **Photo Upload** — 8 specific photos (3 face, 3 body, feet, hands) with visual guidelines, stored securely in blob storage
5. **Zoom Booking** — Embedded Calendly widget to schedule initial profiling session
6. **Dashboard** — Confirmation with enrollment status and next steps

### 3. Authentication & Role Management
- Email + password sign-up and login
- Auto-assign roles based on chosen subscription tier
- Protected routes — role-based access to different sections of the app
- Trainer (owner) has admin-level access to everything

### 4. APP — Client Dashboard (Wrens / Robins / Subscribers)
- **My Profile** — Personal details, Creator Type results (once profiled), photo management
- **My Sessions** — Upcoming and past Zoom bookings
- **Enrollment Status** — Visual progress tracker through the profiling journey
- **Subscription** — View plan, upgrade, cancel, payment history
- **Community** — "Coming Soon" link (foundation ready)
- **Gamer** — "Coming Soon" link (foundation ready)

### 5. APP — Practitioner Dashboard (Trainees / Practitioners)
- **My Clients** — Assigned clients with profiling status and submitted photos
- **My Training** — Access LMS course modules and track progress
- **My Sessions** — Upcoming/past Zoom sessions with clients
- **My Case Studies** — Create and manage case studies of profiled individuals (stored in LMS)
- **My Profile** — Personal details and Creator Type info

### 6. APP — Admin Panel (Trainer / Owner)
- **User Management** — View all users, search/filter, assign or change roles
- **Client Oversight** — See all clients across all practitioners, reassign as needed
- **LMS Content Management** — Create/edit/reorder courses, modules, lessons, assessments
- **Case Study Review** — View and approve practitioner-submitted case studies
- **Enrollment Overview** — Dashboard of signups, payment status, pipeline metrics
- **Role Assignment** — Promote Trainees to Practitioners, manage all permissions

### 7. LMS (Full Framework)
- **Courses & Modules** — organized into sections with individual lessons
- **Content Types** — video, text, audio, and photos
- **Case Studies** — practitioners create case studies of profiled individuals, with peer review and trainer sign-off workflow; the core training mechanism
- **Training Materials** — downloadable resources and reference materials
- **Progress Tracking** — per-user completion markers and advancement indicators
- **Access Control** — only Trainees, Practitioners, and Trainer see training content

### 8. Stripe Payments (Multiple Methods)
- 4 subscription products matching tier pricing
- Owl tier: one-time enrollment fee + recurring subscription
- Payment methods at checkout: credit/debit card, bank transfer/EFT, BECS Direct Debit, PayID
- Payment history in user dashboard
- Subscription management (upgrade/downgrade/cancel)

### 9. Coming Soon Pages (Foundations Ready)
- **Community** — placeholder page with "Coming Soon" messaging, database tables ready
- **Game** — placeholder page with "Coming Soon" messaging, database tables ready
- **Shop** — placeholder page with "Coming Soon" messaging, database tables ready (Shopify integration to be enabled when ready for physical products)

---

## Design Direction
- **Warm & nature-inspired** — earthy gold (#D4AF37), forest greens, warm creams and neutrals
- Nature motifs reflecting the 13 Creator Types (River, Tree, Sun, Mountain, etc.)
- Clean, welcoming typography with organic shapes and rounded corners
- Smooth progress indicators throughout enrollment and LMS
- Fully mobile-responsive, PWA-ready
- Consistent navigation structure reflecting the mind map hierarchy

