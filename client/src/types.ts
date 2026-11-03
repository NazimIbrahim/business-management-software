// Client TypeScript Data Types

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: 'admin' | 'manager' | 'salesperson' | 'accounts' | string;
  email?: string;
  phone?: string;
  monthly_target?: number;
  is_active?: boolean;
  permissions?: Record<string, boolean>;
}

export interface Role {
  id: number;
  name: string;
  display_name: string;
  description?: string;
  permissions: Record<string, boolean>;
  is_system?: boolean;
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  mobile_number: string;
  email?: string;
  delivery_address: string;
  site_location?: string;
  gstin?: string;
  notes?: string;
  is_active: boolean;
  quotations_count?: number;
  total_quoted?: number;
  closed_count?: number;
  closed_total?: number;
}

export interface TileBrand {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
}

export type ProductType = 'box' | 'pieces' | 'sqft' | 'bags' | 'nos';

export interface TileCatalogItem {
  id?: number;
  description: string;
  brand?: string;
  size?: string;
  product_type?: ProductType;
  coverage_area?: number;
  base_rate_per_sqft?: number;
  rate_per_sqft?: number;
  base_rate_per_box?: number;
  rate_per_box?: number;
  usage_count?: number;
  last_used_at?: string;
}

export interface BrandSizeCoverage {
  id: number;
  brand_id: number;
  brand_name?: string;
  size: string;
  product_type?: ProductType;
  coverage_sqft: number;
  pieces_per_box: number;
  default_rate_sqft: number;
  default_rate_box: number;
  is_active: boolean;
}

export type QuotationType = 'tiles' | 'sanitary';

export interface SanitaryItem {
  id?: number;
  sl_no: number;
  item_code: string;
  item_description: string;
  item_image?: string;
  quantity: number; // in nos
  mrp_price: number; // MRP price per nos
  discount_percent: number; // discount percentage
  discounted_price: number; // discounted price per nos
  total_price: number; // quantity * discounted_price
}

export interface SanitaryCatalogItem {
  id?: number;
  item_code: string;
  brand?: string;
  category?: string;
  item_description: string;
  mrp_price: number;
  item_image?: string | null;
  catalog_name?: string | null;
  page_number?: number | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface QuotationItem {
  id?: number;
  area_id?: number;
  sl_no: number;
  description: string;
  size: string;
  brand: string;
  product_type?: ProductType;
  coverage_area: number;
  quantity_sqft: number;
  base_rate_per_sqft?: number;
  rate_per_sqft: number;
  quantity_boxes: number;
  base_rate_per_box?: number;
  rate_per_box: number;
  discount_percent?: number;
  discount_amount?: number;
  total_amount: number;
  item_code?: string;
  item_image?: string;
  mrp_price?: number;
  encrypted_code?: string;
  dispatch_status?: 'Ready Stock' | 'Need to Arrange from Local' | 'Factory Order' | 'Dispatched' | string;
  expected_dispatch_date?: string | null;
  dispatch_notes?: string | null;
  dispatched_at?: string | null;
  dispatched_quantity?: number | string | null;
  procurement_status?: string | null;
  procurement_notes?: string | null;
  procurement_updated_at?: string | null;
  area_name?: string;
  _itemBaseTotal?: number;
}

export interface QuotationArea {
  id?: number;
  quotation_id?: number;
  area_name: string;
  display_order: number;
  items: QuotationItem[];
}

export interface Quotation {
  id: number;
  quotation_number: string;
  quotation_date: string;
  customer_id?: number;
  customer_name: string;
  customer_phone: string;
  customer_gstin?: string;
  delivery_address: string;
  site_location?: string;
  sales_person_id: number;
  sales_person_name: string;
  assisted_sales_person_id?: number | null;
  assisted_sales_person_name?: string | null;
  split_share_type?: 'percentage' | 'amount' | null;
  primary_sales_share_percent?: number;
  primary_sales_share_amount?: number;
  assisted_sales_share_percent?: number;
  assisted_sales_share_amount?: number;
  project_name?: string;
  quotation_type?: QuotationType;
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'closed';
  manager_approval_note?: string;
  approved_by_id?: number;
  approved_by_name?: string;
  approved_at?: string;
  gross_total: number;
  discount_percent: number;
  discount_amount: number;
  taxable_amount: number;
  tax_type: 'cgst_sgst' | 'igst' | 'exempt';
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  round_off: number;
  net_total: number;
  special_notes?: string;
  dispatch_status?: 'Ready Stock' | 'Need to Arrange from Local' | 'Factory Order' | 'Dispatched' | string;
  expected_dispatch_date?: string | null;
  dispatch_notes?: string | null;
  dispatched_at?: string | null;
  dispatched_by_id?: number | null;
  dispatched_by_name?: string | null;
  has_dispatch_item_changes?: boolean;
  dispatch_change_summary?: string;
  dispatch_change_acknowledged_at?: string;
  total_items?: number;
  dispatched_items_count?: number;
  ready_stock_items_count?: number;
  local_arrange_items_count?: number;
  factory_order_items_count?: number;
  total_procurement_items?: number;
  proc_reached_godown_count?: number;
  proc_on_the_way_count?: number;
  version: number;
  created_at: string;
  total_paid?: number;
  balance_due?: number;
}

export interface Payment {
  id: number;
  payment_number: string;
  quotation_id: number;
  quotation_number?: string;
  customer_name?: string;
  quotation_net_total?: number;
  amount: number;
  payment_mode: 'Cash' | 'Cheque' | 'Bank Transfer (NEFT/RTGS/IMPS)' | 'UPI (GPay/PhonePe/Paytm)' | 'Card';
  payment_date: string;
  status: 'Recorded' | 'Cleared' | 'Bounced' | 'Refunded';
  reference_number?: string;
  notes?: string;
  recorded_by_id?: number;
  recorded_by_name?: string;
  created_at: string;
}

export interface SalesTarget {
  id: number;
  sales_person_id: number;
  sales_person_name?: string;
  target_type: 'Daily' | 'Weekly' | 'Monthly' | 'Custom';
  start_date: string;
  end_date: string;
  period_label: string;
  target_amount: number;
  notes?: string;
}

export interface CompanySettings {
  id: number;
  company_name: string;
  tagline: string;
  logo_base64?: string;
  address_line1: string;
  address_line2: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  state: string;
  state_code: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  ifsc_code: string;
  branch: string;
  account_type: string;
  upi_details: string;
  store_manager_title: string;
  store_manager_name: string;
  store_manager_phone: string;
  sales_associate_title: string;
  terms_json: string[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
