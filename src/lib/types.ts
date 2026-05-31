// Tipos para la importación de propiedades desde CSV

export interface ExcelPropertyRow {
  title: string;
  description: string;
  price: string | number;
  address: string;
  bedrooms: string | number;
  bathrooms: string | number;
  parking_spaces?: string | number;
  lot_area: string | number;
  built_area: string | number;
  Map_link?: string;
  is_private?: string | boolean;
  is_featured?: string | boolean;
  estimated_completion?: string;
  highlight?: string;
  h2?: string;
  main_image: string; // URL
  gallery?: string; // URLs separadas por comas
  category?: string; // Nombre o slug
  property_status?: string; // Nombre o slug
  location?: string; // Nombre o slug (opcional)
  amenities?: string; // Nombres o slugs separados por comas (opcional)
  [key: string]: any;
}

export interface ExcelUnitRow {
  housing_number: string | number;
  bedrooms: string | number;
  built_area: string | number;
  price: string | number;
  storage_room: string | boolean; // TRUE/FALSE
  garage: string | boolean; // TRUE/FALSE
  is_available: string | boolean; // TRUE/FALSE
  bathrooms: string | number;
  exterior_area: string | number;
  floor?: string | number; // Ahora puede ser numérico
  property_title?: string; // Para vincular con propiedad
  [key: string]: any;
}

export interface ImportOptions {
  dryRun: boolean;
  locale?: string;
  updateExisting: boolean;
  propertiesFile: string;
  unitsFile?: string; // CSV de unidades opcional
  verbose?: boolean;
}

export interface ImportResult {
  total: number;
  success: number;
  errors: Array<{
    row: number;
    property: string;
    error: string;
  }>;
  warnings: Array<{
    row: number;
    property: string;
    warning: string;
  }>;
  skipped: number;
}

export interface StrapiMedia {
  id: number;
  documentId?: string;
  url?: string;
}

export interface ResolvedRelations {
  category?: { id: number; documentId: string };
  property_status?: { id: number; documentId: string };
  location?: { id: number; documentId: string };
  amenities?: Array<{ id: number; documentId: string }>;
}

export interface PropertyToCreate {
  title: string;
  description: any[]; // Blocks format for Strapi (array of block objects)
  price: number;
  address: string;
  bedrooms: number;
  bathrooms: number;
  parking_spaces?: number;
  lot_area: number;
  built_area: number;
  Map_link?: string;
  is_private: boolean;
  is_featured: boolean;
  estimated_completion?: string;
  highlight?: string;
  main_image?: number | null; // Media ID
  gallery?: number[]; // Media IDs
  category?: string; // Relation Document ID
  property_status?: string; // Relation Document ID
  location?: string; // Relation Document ID
  amenities?: string[]; // Relation Document IDs
  slug?: string;
  publishedAt?: string | null;
}

export interface UnitToCreate {
  housing_number: string;
  bedrooms: string;
  built_area: string;
  price: string;
  storage_room: boolean;
  garage: boolean;
  is_available: boolean;
  bathrooms: number;
  exterior_area: string;
  floor?: string | number; // Media ID instead of boolean/string URL
  property?: number; // Related Property ID

}

