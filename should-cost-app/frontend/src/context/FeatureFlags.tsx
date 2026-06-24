import { createContext, useContext, ReactNode } from 'react';

export interface FeatureFlags {
  enableAIInsights: boolean;
  enableExcelExport: boolean;
  enablePptxExport: boolean;
  enableCsvExport: boolean;
  enableCommodityLive: boolean;
  enableNegotiationPipeline: boolean;
  enableACRTracker: boolean;
  enableAssemblyBOM: boolean;
  enableCEREstimator: boolean;
  enableRateLibrary: boolean;
  enableCommandPalette: boolean;
  enableEmailDigest: boolean;
  enableSupplierPortal: boolean;
  enableMultiTenancy: boolean;
  enableAuditLog: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  enableAIInsights: true,
  enableExcelExport: true,
  enablePptxExport: true,
  enableCsvExport: true,
  enableCommodityLive: true,
  enableNegotiationPipeline: true,
  enableACRTracker: true,
  enableAssemblyBOM: true,
  enableCEREstimator: true,
  enableRateLibrary: true,
  enableCommandPalette: true,
  enableEmailDigest: true,
  enableSupplierPortal: true,
  enableMultiTenancy: false,   // Off until org migration is complete
  enableAuditLog: true,
};

const FeatureFlagContext = createContext<FeatureFlags>(DEFAULT_FLAGS);

export function FeatureFlagProvider({ children, overrides }: {
  children: ReactNode;
  overrides?: Partial<FeatureFlags>;
}) {
  const flags = { ...DEFAULT_FLAGS, ...overrides };
  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlag<K extends keyof FeatureFlags>(flag: K): FeatureFlags[K] {
  return useContext(FeatureFlagContext)[flag];
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagContext);
}
