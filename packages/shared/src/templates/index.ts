export const APP_LANGUAGE_CODES = ['en', 'sw', 'fr', 'ar', 'ur', 'pt'] as const;

export type AppLanguageCode = (typeof APP_LANGUAGE_CODES)[number];

export const TEMPLATE_OVERLAY_LANGUAGE_CODES = ['sw', 'fr', 'ar', 'ur', 'pt'] as const;

export type TemplateOverlayLanguageCode = (typeof TEMPLATE_OVERLAY_LANGUAGE_CODES)[number];

export const TEMPLATE_KINDS = ['gross', 'reporting'] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_SCHEMA_STYLES = ['flat', 'nested'] as const;

export type TemplateSchemaStyle = (typeof TEMPLATE_SCHEMA_STYLES)[number];

export interface TemplateCatalogEntry {
	templateKey: string;
	templateId: string;
	family: string;
	kind: TemplateKind;
	schemaStyle: TemplateSchemaStyle;
	title: string;
	relativeDir: string;
	availableLanguages: AppLanguageCode[];
}

export interface TemplateDefinition<TCore = unknown, TTranslation = unknown> {
	templateKey: string;
	templateId: string;
	family: string;
	kind: TemplateKind;
	schemaStyle: TemplateSchemaStyle;
	title: string;
	language: AppLanguageCode;
	availableLanguages: AppLanguageCode[];
	core: TCore;
	translation: TTranslation | null;
}

// Asset files are copied to dist/templates/assets during the shared package build.
export const TEMPLATE_ASSET_DIRECTORY = 'templates/assets';