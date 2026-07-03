// ============================================================
// Shared TypeScript interfaces mirroring the PostgreSQL schema
// ============================================================

export interface Role {
  id: number;
  name: 'admin' | 'internal' | 'supplier';
  description?: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  roleId: number;
  supplierId?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartMaster {
  id: number;
  partNumber: string;
  description?: string;
  uom?: string;
  commodity?: string;
  drawingRev?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  country?: string;
  contactName?: string;
  contactEmail?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShouldCostHeader {
  id: number;
  partId: number;
  version: number;
  status: 'draft' | 'published' | 'archived';
  annualVolume?: number;
  currency: string;
  totalCost?: number;
  notes?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShouldCostBreakdown {
  id: number;
  shouldCostHeaderId: number;
  costElement: string;
  category?: string;
  value: number;
  basis?: string;
  notes?: string;
  sortOrder: number;
}

export interface SupplierQuoteHeader {
  id: number;
  partId: number;
  supplierId: number;
  version: number;
  status: 'submitted' | 'accepted' | 'rejected' | 'negotiating';
  rfqNumber?: string;
  annualVolume?: number;
  currency: string;
  totalPrice?: number;
  validityDate?: Date;
  submittedAt?: Date;
  submittedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierQuoteBreakdown {
  id: number;
  supplierQuoteHeaderId: number;
  costElement: string;
  category?: string;
  value: number;
  basis?: string;
  notes?: string;
  sortOrder: number;
}

export interface ComparisonSnapshot {
  id: number;
  partId: number;
  shouldCostHeaderId: number;
  supplierQuoteHeaderId: number;
  snapshotName?: string;
  totalShouldCost?: number;
  totalQuotePrice?: number;
  totalVariance?: number;
  variancePct?: number;
  status: 'open' | 'reviewed' | 'closed';
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComparisonDetail {
  id: number;
  comparisonSnapshotId: number;
  costElement: string;
  category?: string;
  shouldCostValue: number;
  quoteValue: number;
  variance: number;
  variancePct?: number;
  flag?: 'over' | 'under' | 'acceptable';
  sortOrder: number;
}

export interface AIInsightFlag {
  element: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AIInsight {
  id: number;
  comparisonSnapshotId: number;
  modelUsed?: string;
  promptVersion: string;
  summary?: string;
  flags?: AIInsightFlag[];
  questions?: string[];
  recommendations?: string[];
  rawResponse?: Record<string, unknown>;
  generatedAt: Date;
  generatedBy?: string;
}

// ---------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------
export interface CreateShouldCostDto {
  partId: number;
  annualVolume?: number;
  currency?: string;
  notes?: string;
  breakdown: Array<{
    costElement: string;
    category?: string;
    value: number;
    basis?: string;
    notes?: string;
    sortOrder?: number;
  }>;
}

export interface CreateQuoteDto {
  partId: number;
  supplierId: number;
  rfqNumber?: string;
  annualVolume?: number;
  currency?: string;
  validityDate?: string;
  breakdown: Array<{
    costElement: string;
    category?: string;
    value: number;
    basis?: string;
    notes?: string;
    sortOrder?: number;
  }>;
}

export interface CreateComparisonDto {
  partId: number;
  shouldCostHeaderId: number;
  supplierQuoteHeaderId: number;
  snapshotName?: string;
}

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: string;
  supplierId?: number;
  orgId?: string;    // organization (tenant) id — used for row-level isolation
  iat?: number;
  exp?: number;
}
