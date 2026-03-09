

# Plan: Seed Mock Data for 3 Course Types + Sales Pages with Pricing

## What Needs to Happen

Create comprehensive mock data in the database for a **Masterclass**, **Cohort**, and **Workshop** — each with full content (modules/lessons), a linked **Sales Page** with multiple pricing variants, and proper course-type-specific configuration.

## Data to Insert

### 1. Masterclass: "Cinematography Masterclass by Karthik Subbaraj"
- **Use existing course** `db02d1d4` which already has 6 modules and 15 lessons
- Update its fields: `instructor_name`, `description`, `short_description`, `category`, `estimated_duration`, `price`, `tags`
- **Create Sales Page**: "Cinematography Masterclass" with hero description, trailer URL
- **4 Pricing Variants**:
  - Early Bird: ₹2,999 (active for ads)
  - Standard: ₹4,999 (show in app)
  - Premium (with mentorship): ₹9,999 (active for ads)
  - Full Access Bundle: ₹14,999 (active for ads)
- Tag the course to the sales page

### 2. Cohort: "Complete Filmmaking Cohort"
- **Use existing course** `d1212895` which has 3 modules but needs lessons
- Update fields for cohort-specific config: `is_recurring`, `max_students`, schedule
- Add **8 lessons** across its 3 modules (Week 1-3 structure with live session links + recording placeholders)
- Add **course_schedules** (Saturday/Sunday slots with Zoom links)
- **Create Sales Page**: "Complete Filmmaking Cohort — Batch 4" with application form enabled
- **3 Pricing Variants**:
  - Standard: ₹14,999 (show in app)
  - Early Bird: ₹11,999 (active for ads)
  - EMI Plan: ₹5,499/month × 3 (active for ads)
- Tag the course to the sales page

### 3. Workshop: "Mobile Filmmaking Bootcamp"
- **Create new course** (workshop type): single-day workshop with 1 module, 3-4 lessons (pre-workshop material, live session recording placeholder, resources)
- Set `zoom_link`, schedule
- **Create Sales Page**: "Mobile Filmmaking Bootcamp — Mumbai" 
- **2 Pricing Variants**:
  - Standard: ₹1,999 (show in app)
  - Group (3+): ₹1,499/person (active for ads)
- Tag the course to the sales page

### 4. Course Resources
- Add 2-3 `course_resources` per course (slides, templates, reference PDFs)

## Implementation Steps

1. **Update existing Masterclass course** with rich metadata
2. **Insert lessons** for the Cohort course's 3 existing modules
3. **Create new Workshop course** with module + lessons
4. **Create 3 Sales Pages** with full presale descriptions
5. **Create 9 Pricing Variants** across the 3 sales pages
6. **Create Sales Page ↔ Course links** via `sales_page_courses`
7. **Add course schedules** for cohort and workshop
8. **Add course resources** for all 3 courses

All inserts use the database insert tool (data operations, not schema changes).

## Technical Notes

- The `course_pricing_variants` table requires a `course_id` FK — will use each course's actual ID
- Sales page pricing variants also need `sales_page_id` set
- Cohort sales page will have `show_application_form: true`
- Workshop sales page gets `course_type_hint: workshop`
- All sales pages will be set to `is_published: true` so they're immediately testable

