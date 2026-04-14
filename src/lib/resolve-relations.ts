// Resolver relaciones (categorías, ubicaciones, status, amenities)

import { strapiClient } from './strapi-client';
import type { ResolvedRelations } from './types';

export interface ResolveRelationsOptions {
  category?: string;
  property_status?: string;
  location?: string;
  amenities?: string;
  createIfMissing?: boolean;
  locale?: string;
}

export async function resolveRelations(
  options: ResolveRelationsOptions
): Promise<ResolvedRelations> {
  const resolved: ResolvedRelations = {};
  const { createIfMissing = true } = options;

  // Resolver categoría
  if (options.category) {
    console.log(`  🔍 Buscando categoría: "${options.category}"`);
    const category = await resolveCategory(options.category, createIfMissing, options.locale);
    if (category) {
      resolved.category = category;
      console.log(`  ✅ Categoría resuelta: ${category.id} (${category.documentId})`);
    } else {
      console.log(`  ⚠️  No se pudo resolver categoría: "${options.category}"`);
    }
  }

  // Resolver property_status
  if (options.property_status) {
    console.log(`  🔍 Buscando property_status: "${options.property_status}"`);
    const status = await resolvePropertyStatus(options.property_status, createIfMissing, options.locale);
    if (status) {
      resolved.property_status = status;
      console.log(`  ✅ Property status resuelto: ${status.id} (${status.documentId})`);
    } else {
      console.log(`  ⚠️  No se pudo resolver property_status: "${options.property_status}"`);
    }
  }

  // Resolver ubicación
  if (options.location) {
    console.log(`  🔍 Buscando location: "${options.location}"`);
    const location = await resolveLocation(options.location, createIfMissing);
    if (location) {
      resolved.location = location;
      console.log(`  ✅ Location resuelta: ${location.id} (${location.documentId})`);
    } else {
      console.log(`  ⚠️  No se pudo resolver location: "${options.location}"`);
    }
  }

  // Resolver amenities
  if (options.amenities) {
    const amenitiesList = options.amenities
      .split(',')
      .map(a => a.trim())
      .filter(Boolean);
    
    if (amenitiesList.length > 0) {
      console.log(`  🔍 Buscando amenities: ${amenitiesList.join(', ')}`);
      const amenities = await resolveAmenities(amenitiesList, createIfMissing, options.locale);
      if (amenities.length > 0) {
        resolved.amenities = amenities;
        console.log(`  ✅ Amenities resueltos: ${amenities.length} encontrados`);
      } else {
        console.log(`  ⚠️  No se pudieron resolver amenities: ${amenitiesList.join(', ')}`);
      }
    }
  }

  return resolved;
}

// Resolver categoría por nombre o slug
async function resolveCategory(
  nameOrSlug: string,
  createIfMissing: boolean = true,
  locale: string = 'en'
): Promise<{ id: number; documentId: string } | null> {
  const existing = await strapiClient.findCategoryByNameOrSlug(nameOrSlug, locale);
  
  if (existing) {
    return existing;
  }

  if (createIfMissing) {
    try {
      return await strapiClient.createCategoryIfNotExists(nameOrSlug, undefined, locale);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Si es error 405, probablemente no tiene permisos o el endpoint no existe
      // Continuar sin la categoría y mostrar warning
      console.warn(`⚠️  No se pudo crear categoría "${nameOrSlug}": ${errorMsg}`);
      console.warn(`   La categoría debe existir previamente en Strapi o el token necesita permisos de creación`);
      return null;
    }
  }

  return null;
}

// Resolver property_status por título
async function resolvePropertyStatus(
  title: string,
  createIfMissing: boolean = true,
  locale: string = 'en'
): Promise<{ id: number; documentId: string } | null> {
  // Buscar por título (case-insensitive) o slug con locale
  const existing = await strapiClient.findStatusByTitleOrSlug(title, locale);
  
  if (existing) {
    return existing;
  }

  if (createIfMissing) {
    try {
      console.log(`  📝 Creando nuevo status: "${title}"`);
      return await strapiClient.createStatusIfNotExists(title, locale);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠️  No se pudo crear status "${title}": ${errorMsg}`);
      console.warn(`     El status debe existir previamente en Strapi o el token necesita permisos de creación`);
      return null;
    }
  }

  return null;
}

// Resolver ubicación por nombre o slug
async function resolveLocation(
  nameOrSlug: string,
  createIfMissing: boolean = true
): Promise<{ id: number; documentId: string } | null> {
  const existing = await strapiClient.findLocationByNameOrSlug(nameOrSlug);
  
  if (existing) {
    return existing;
  }

  if (createIfMissing) {
    try {
      return await strapiClient.createLocationIfNotExists(nameOrSlug);
    } catch (error) {
      console.error(`Error creando ubicación "${nameOrSlug}":`, error);
      return null;
    }
  }

  return null;
}

// Resolver amenities (many-to-many)
async function resolveAmenities(
  names: string[],
  createIfMissing: boolean = true,
  locale: string = 'en'
): Promise<Array<{ id: number; documentId: string }>> {
  const result: Array<{ id: number; documentId: string }> = [];
  const foundIds = new Set<number>();
  
  // Para cada nombre, buscar y crear si no existe
  for (const name of names) {
    try {
      // Buscar amenity existente con locale
      let amenity = await strapiClient.findAmenityByName(name, locale);
      
      // Si no existe y createIfMissing está activo, crear
      if (!amenity && createIfMissing) {
        console.log(`  📝 Creando nuevo amenity: "${name}"`);
        amenity = await strapiClient.createAmenityIfNotExists(name, locale);
      }
      
      // Agregar a resultados si existe y no está duplicado
      if (amenity && !foundIds.has(amenity.id)) {
        result.push(amenity);
        foundIds.add(amenity.id);
      } else if (!amenity) {
        console.warn(`  ⚠️  Amenity "${name}" no encontrado y no se pudo crear`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠️  Error procesando amenity "${name}": ${errorMsg}`);
    }
  }
  
  return result;
}

