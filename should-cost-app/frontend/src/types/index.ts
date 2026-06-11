export interface PartMaster {
  id: number;
  part_number: string;
  description?: string;
  uom?: string;
  commodity?: string;
  system_id?: number;
  subsystem_id?: number;
  component_id?: number;
  system_name?: string;
  subsystem_name?: string;
  component_name?: string;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  country?: string;
  contact_name?: string;
  contact_email?: string;
}

export interface ShouldCostHeader {
  id: number;
  part_id: number;
  part_number: string;
  part_description?: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  annual_volume?: number;
  currency: string;
  total_cost?: number;
  notes?: string;
  created_at: string;
}

export interface ShouldCostBreakdown {
  id: number;
  should_cost_header_id: number;
  cost_element: string;
  category?: string;
  value: number;
  basis?: string;
  notes?: string;
  sort_order: number;
}

export interface ShouldCostDetail {
  header: ShouldCostHeader;
  breakdown: ShouldCostBreakdown[];
}

export interface SupplierQuoteHeader {
  id: number;
  part_id: number;
  part_number: string;
  part_description?: string;
  supplier_id: number;
  supplier_name: string;
  supplier_country?: string;
  version: number;
  status: 'submitted' | 'accepted' | 'rejected' | 'negotiating';
  rfq_number?: string;
  annual_volume?: number;
  currency: string;
  total_price?: number;
  validity_date?: string;
  submitted_at?: string;
}

export interface SupplierQuoteBreakdown {
  id: number;
  supplier_quote_header_id: number;
  cost_element: string;
  category?: string;
  value: number;
  basis?: string;
  notes?: string;
  sort_order: number;
}

export interface SupplierQuoteDetail {
  header: SupplierQuoteHeader;
  breakdown: SupplierQuoteBreakdown[];
}

export interface ComparisonSnapshot {
  id: number;
  part_id: number;
  part_number: string;
  should_cost_header_id: number;
  supplier_quote_header_id: number;
  supplier_name: string;
  snapshot_name?: string;
  total_should_cost?: number;
  total_quote_price?: number;
  total_variance?: number;
  variance_pct?: number;
  status: 'open' | 'reviewed' | 'closed';
  currency?: string;
  created_at: string;
}

export interface ComparisonDetail {
  id: number;
  comparison_snapshot_id: number;
  cost_element: string;
  category?: string;
  should_cost_value: number;
  quote_value: number;
  variance: number;
  variance_pct?: number;
  flag?: 'over' | 'under' | 'acceptable';
  sort_order: number;
}

export interface AIInsightFlag {
  element: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AIInsight {
  id: number;
  comparison_snapshot_id: number;
  model_used?: string;
  prompt_version: string;
  summary?: string;
  flags?: AIInsightFlag[];
  questions?: string[];
  recommendations?: string[];
  raw_response?: Record<string, unknown>;
  generated_at: string;
}

export interface ComparisonFull {
  snapshot: ComparisonSnapshot;
  details: ComparisonDetail[];
  latestInsight: AIInsight | null;
}

export interface VehicleSystem    { id: number; code: string; name: string; icon?: string; sort_order: number; }
export interface VehicleSubsystem { id: number; system_id: number; code: string; name: string; }
export interface VehicleComponent { id: number; subsystem_id: number; code: string; name: string; }

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'internal' | 'supplier';
  supplierId?: number;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
}
