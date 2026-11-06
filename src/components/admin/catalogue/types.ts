export interface CatPage {
  id: string; slug: string; title: string; listing: string; position: number; carousel_position: number | null;
  opens: string; button_offering_id: string | null; carousel_title: string | null; card_image_url: string | null;
}
export interface CatOffering {
  id: string; slug: string; title: string; status: string; access: string; price_inr: number | string | null;
  product_tier: string | null; page_id: string | null; thumbnail_url: string | null; tally_form_url: string | null;
  payment_mode: string | null; has_landing: boolean;
}
export interface CatCourse { id: string; title: string; status: string | null; lessons: number }
