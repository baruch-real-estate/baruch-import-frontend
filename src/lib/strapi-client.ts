// Cliente Strapi especializado para operaciones de importación

import type { UnitToCreate } from './types';

// Las variables de entorno deben estar cargadas por dotenv antes de importar este módulo
const STRAPI_HOST = process.env.STRAPI_HOST || 'http://localhost:1337';
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

interface StrapiResponse<T> {
  data: T;
  meta?: any;
}

interface StrapiError {
  error: {
    status: number;
    name: string;
    message: string;
    details?: any;
  };
}

class StrapiClient {
  private baseUrl: string;
  private token: string | undefined;

  constructor() {
    this.baseUrl = STRAPI_HOST.replace(/\/$/, ''); // Remover trailing slash
    this.token = STRAPI_TOKEN;
  }

  // Validar que el token esté configurado (lazy validation)
  private ensureToken(): void {
    if (!this.token) {
      throw new Error('STRAPI_TOKEN no está configurado en las variables de entorno');
    }
  }

  public async fetchWithAuth(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    this.ensureToken(); // Validar token solo cuando se necesita

    const url = `${this.baseUrl}/api${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      ...(options.headers as Record<string, string> || {}),
    };

    // Solo agregar Content-Type si no está definido y no es una subida de archivos
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData: StrapiError = await response.json().catch(() => ({
        error: {
          status: response.status,
          name: 'Error',
          message: response.statusText,
        },
      }));

      // Mensajes más descriptivos para errores comunes
      let errorMessage = errorData.error.message;
      if (response.status === 405) {
        errorMessage = `Method Not Allowed. Verifica que el token tenga permisos de ${options.method || 'POST/PUT'} para este endpoint.`;
      } else if (response.status === 401) {
        errorMessage = `Unauthorized. El token no es válido o ha expirado.`;
      } else if (response.status === 403) {
        errorMessage = `Forbidden. El token no tiene permisos para esta operación.`;
      }

      throw new Error(
        `Strapi API Error (${errorData.error.status}): ${errorMessage}`
      );
    }

    return response;
  }

  // Buscar propiedad por slug o título
  async findPropertyBySlugOrTitle(slugOrTitle: string, locale?: string): Promise<{
    id: number;
    documentId: string;
  } | null> {
    try {
      const localeParam = locale ? `&locale=${locale}` : '';
      const response = await this.fetchWithAuth(
        `/properties?filters[$or][0][slug][$eq]=${encodeURIComponent(slugOrTitle)}&filters[$or][1][title][$eq]=${encodeURIComponent(slugOrTitle)}${localeParam}&fields[0]=id&fields[1]=documentId`
      );
      const data: StrapiResponse<Array<{ id: number; documentId: string }>> = await response.json();

      if (data.data && data.data.length > 0) {
        return {
          id: data.data[0].id,
          documentId: data.data[0].documentId,
        };
      }
      return null;
    } catch (error) {
      console.error(`Error buscando propiedad "${slugOrTitle}":`, error);
      return null;
    }
  }

  // Buscar propiedad por título exacto (para vincular unidades)
  async findPropertyByTitle(title: string, locale: string = 'en'): Promise<{
    id: number;
    documentId: string;
  } | null> {
    try {
      const localeParam = locale ? `&locale=${locale}` : '';
      const response = await this.fetchWithAuth(
        `/properties?filters[title][$eq]=${encodeURIComponent(title)}${localeParam}&fields[0]=id&fields[1]=documentId`
      );
      const data: StrapiResponse<Array<{ id: number; documentId: string }>> = await response.json();

      if (data.data && data.data.length > 0) {
        return {
          id: data.data[0].id,
          documentId: data.data[0].documentId,
        };
      }
      return null;
    } catch (error) {
      console.error(`Error buscando propiedad por título "${title}":`, error);
      return null;
    }
  }

  // Crear o actualizar propiedad
  async createOrUpdateProperty(
    propertyData: any,
    locale: string = 'en',
    updateMode: boolean = false
  ): Promise<{ id: number; documentId: string }> {
    // Buscar si existe
    const existing = propertyData.slug
      ? await this.findPropertyBySlugOrTitle(propertyData.slug, locale)
      : null;

    if (existing && updateMode) {
      // Actualizar propiedad existente
      const response = await this.fetchWithAuth(
        `/properties/${existing.documentId}?locale=${locale}`,
        {
          method: 'PUT',
          body: JSON.stringify({ data: propertyData }),
        }
      );
      const data: StrapiResponse<{ id: number; documentId: string }> = await response.json();
      return { id: data.data.id, documentId: data.data.documentId };
    } else if (!existing) {
      // Si no existe y el locale no es el default ('en'), buscar la entrada base para vincular
      if (locale !== 'en') {
        console.log(`  🔍 Buscando propiedad base (en) para vincular traducción...`);
        const baseEntry = await this.findPropertyBySlugOrTitle(propertyData.slug, 'en');

        if (baseEntry) {
          console.log(`  🔗 Encontrada entrada base (en) ID: ${baseEntry.documentId}. Creando localización '${locale}' vía PUT (Strapi v5)...`);

          // ESTRATEGIA STRAPI V5:
          // Para crear una localización, hacemos PUT al documentId existente pero con el param ?locale=es
          // Esto agrega la versión en ese idioma al mismo documento.

          try {
            const response = await this.fetchWithAuth(
              `/properties/${baseEntry.documentId}?locale=${locale}`,
              {
                method: 'PUT',
                body: JSON.stringify({
                  data: propertyData
                }),
              }
            );

            if (response.ok) {
              const data: StrapiResponse<{ id: number; documentId: string }> = await response.json();
              // En v5 el documentId debería ser el mismo
              return { id: data.data.id, documentId: data.data.documentId };
            } else {
              const errorText = await response.text();
              console.error(`  ❌ Falló PUT para crear localización (HTTP ${response.status}): ${errorText}`);
              throw new Error(`Error al crear localización en Strapi v5: ${errorText}`);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`  ❌ Error crítico al crear localización v5: ${msg}`);
            throw e;
          }
        } else {
          console.log(`  ⚠️  No se encontró propiedad base en inglés con slug "${propertyData.slug}". Se creará como independiente.`);
        }
      }

      // Crear nueva propiedad (estándar)
      // Solo llegamos aquí si es 'en' o si no se encontró la baseEntry
      const response = await this.fetchWithAuth(
        `/properties?locale=${locale}`,
        {
          method: 'POST',
          body: JSON.stringify({ data: propertyData }),
        }
      );
      const data: StrapiResponse<{ id: number; documentId: string }> = await response.json();
      return { id: data.data.id, documentId: data.data.documentId };
    } else {
      // Ya existe y no estamos en modo update, retornar existente
      return existing;
    }
  }

  // Publicar propiedad
  async publishProperty(documentId: string, locale?: string): Promise<void> {
    const localeParam = locale ? `?locale=${locale}` : '';
    await this.fetchWithAuth(
      `/properties/${documentId}/actions/publish${localeParam}`,
      {
        method: 'POST',
      }
    );
  }

  // Despublicar propiedad (volver a borrador)
  // Nota: En Strapi standard no existe /actions/unpublish, se hace enviando publishedAt: null
  async unpublishProperty(documentId: string, locale?: string): Promise<void> {
    const localeParam = locale ? `?locale=${locale}` : '';
    await this.fetchWithAuth(
      `/properties/${documentId}${localeParam}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          data: {
            publishedAt: null
          }
        })
      }
    );
  }

  // Actualizar solo las relaciones de una propiedad
  async updatePropertyRelations(
    documentId: string,
    relations: {
      property_status?: string;
      location?: string;
      amenities?: string[];
    },
    locale: string = 'en'
  ): Promise<void> {
    const updateData: any = {};

    if (relations.property_status !== undefined) {
      updateData.property_status = relations.property_status;
    }

    if (relations.location !== undefined) {
      updateData.location = relations.location;
    }

    if (relations.amenities !== undefined) {
      updateData.amenities = relations.amenities;
    }

    await this.fetchWithAuth(
      `/properties/${documentId}?locale=${locale}`,
      {
        method: 'PUT',
        body: JSON.stringify({ data: updateData }),
      }
    );
  }

  // Buscar categoría por nombre o slug (con locale)
  async findCategoryByNameOrSlug(nameOrSlug: string, locale: string = 'en'): Promise<{
    id: number;
    documentId: string;
  } | null> {
    try {
      const response = await this.fetchWithAuth(
        `/categories?filters[$or][0][slug][$eq]=${encodeURIComponent(nameOrSlug)}&filters[$or][1][name][$eq]=${encodeURIComponent(nameOrSlug)}&fields[0]=id&fields[1]=documentId&fields[2]=slug&locale=${encodeURIComponent(locale)}`
      );
      const data: StrapiResponse<Array<{ id: number; documentId: string; slug: string }>> = await response.json();

      if (data.data && data.data.length > 0) {
        return {
          id: data.data[0].id,
          documentId: data.data[0].documentId,
        };
      }
      return null;
    } catch (error) {
      console.error(`Error buscando categoría "${nameOrSlug}":`, error);
      return null;
    }
  }

  // Crear categoría si no existe
  async createCategoryIfNotExists(name: string, slug?: string, locale: string = 'en'): Promise<{
    id: number;
    documentId: string;
  }> {
    const existing = await this.findCategoryByNameOrSlug(name, locale);
    if (existing) {
      return existing;
    }

    // Generar slug si no se proporciona
    const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Categorías son localizadas, necesitan locale
    const response = await this.fetchWithAuth(`/categories?locale=${locale}`, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          name,
          slug: categorySlug,
        },
      }),
    });

    const data: StrapiResponse<{ id: number; documentId: string }> = await response.json();

    // Categorías NO tienen draftAndPublish (según schema), así que no necesitan publicación
    // Las categorías se crean publicadas automáticamente

    return { id: data.data.id, documentId: data.data.documentId };
  }

  // Buscar status por título o slug (case-insensitive, con locale)
  async findStatusByTitleOrSlug(titleOrSlug: string, locale: string = 'en'): Promise<{
    id: number;
    documentId: string;
  } | null> {
    try {
      // Buscar por título o slug con locale
      const response = await this.fetchWithAuth(
        `/statuses?filters[$or][0][Title][$contains]=${encodeURIComponent(titleOrSlug)}&filters[$or][1][Slug][$contains]=${encodeURIComponent(titleOrSlug.toLowerCase())}&fields[0]=id&fields[1]=documentId&fields[2]=Title&fields[3]=Slug&locale=${encodeURIComponent(locale)}`
      );
      const data: StrapiResponse<Array<{ id: number; documentId: string; Title: string; Slug: string }>> = await response.json();

      if (data.data && data.data.length > 0) {
        // Buscar coincidencia exacta (case-insensitive)
        const exactMatch = data.data.find(s =>
          s.Title?.toLowerCase() === titleOrSlug.toLowerCase() ||
          s.Slug?.toLowerCase() === titleOrSlug.toLowerCase()
        );

        if (exactMatch) {
          return {
            id: exactMatch.id,
            documentId: exactMatch.documentId,
          };
        }

        // Si no hay coincidencia exacta, retornar el primero
        return {
          id: data.data[0].id,
          documentId: data.data[0].documentId,
        };
      }
      return null;
    } catch (error) {
      console.error(`Error buscando status "${titleOrSlug}":`, error);
      return null;
    }
  }

  // Buscar status por título (método legacy, mantener para compatibilidad)
  async findStatusByTitle(title: string, locale: string = 'en'): Promise<{
    id: number;
    documentId: string;
  } | null> {
    return this.findStatusByTitleOrSlug(title, locale);
  }

  // Crear status si no existe
  async createStatusIfNotExists(title: string, locale: string = 'en'): Promise<{
    id: number;
    documentId: string;
  }> {
    const existing = await this.findStatusByTitle(title, locale);
    if (existing) {
      return existing;
    }

    // Generar slug
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Status es localizado, necesita locale
    const response = await this.fetchWithAuth(`/statuses?locale=${locale}`, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          Title: title,
          slug: slug, // Cambiado de Slug a slug (minúscula)
        },
      }),
    });

    const data: StrapiResponse<{ id: number; documentId: string }> = await response.json();

    // Intentar publicar el status (tiene draftAndPublish: true)
    try {
      await this.fetchWithAuth(
        `/statuses/${data.data.documentId}/actions/publish?locale=${locale}`,
        { method: 'POST' }
      );
    } catch (error) {
      console.warn(`  ⚠️  No se pudo publicar status "${title}" (posiblemente falta de permisos de publish), pero se creó como borrador.`);
    }

    return { id: data.data.id, documentId: data.data.documentId };
  }

  // Buscar ubicación por nombre o slug
  async findLocationByNameOrSlug(nameOrSlug: string): Promise<{
    id: number;
    documentId: string;
  } | null> {
    try {
      const response = await this.fetchWithAuth(
        `/locations?filters[$or][0][slug][$eq]=${encodeURIComponent(nameOrSlug)}&filters[$or][1][name][$eq]=${encodeURIComponent(nameOrSlug)}&fields[0]=id&fields[1]=documentId`
      );
      const data: StrapiResponse<Array<{ id: number; documentId: string }>> = await response.json();

      if (data.data && data.data.length > 0) {
        return {
          id: data.data[0].id,
          documentId: data.data[0].documentId,
        };
      }
      return null;
    } catch (error) {
      console.error(`Error buscando ubicación "${nameOrSlug}":`, error);
      return null;
    }
  }

  // Crear ubicación si no existe
  async createLocationIfNotExists(name: string, slug?: string): Promise<{
    id: number;
    documentId: string;
  }> {
    const existing = await this.findLocationByNameOrSlug(name);
    if (existing) {
      return existing;
    }

    const locationSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const response = await this.fetchWithAuth('/locations', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          name,
          slug: locationSlug,
        },
      }),
    });

    const data: StrapiResponse<{ id: number; documentId: string }> = await response.json();

    // Publicar la ubicación
    await this.fetchWithAuth(
      `/locations/${data.data.documentId}/actions/publish`,
      { method: 'POST' }
    );

    return { id: data.data.id, documentId: data.data.documentId };
  }

  // Buscar amenities por nombre (con locale)
  async findAmenitiesByNames(names: string[], locale: string = 'en'): Promise<Array<{
    id: number;
    documentId: string;
  }>> {
    if (names.length === 0) return [];

    try {
      const filters = names.map((name, idx) =>
        `filters[$or][${idx}][Name][$contains]=${encodeURIComponent(name)}`
      ).join('&');

      const response = await this.fetchWithAuth(
        `/amenities?${filters}&fields[0]=id&fields[1]=documentId&fields[2]=Name&locale=${encodeURIComponent(locale)}`
      );
      const data: StrapiResponse<Array<{ id: number; documentId: string; Name: string }>> = await response.json();

      if (!data.data) return [];

      // Filtrar por coincidencia exacta o parcial
      return data.data
        .filter(amenity => names.some(name =>
          amenity.Name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(amenity.Name.toLowerCase())
        ))
        .map(amenity => ({ id: amenity.id, documentId: amenity.documentId }));
    } catch (error) {
      console.error(`Error buscando amenities:`, error);
      return [];
    }
  }

  // Buscar amenity por nombre (individual, case-insensitive, con locale)
  async findAmenityByName(name: string, locale: string = 'en'): Promise<{
    id: number;
    documentId: string;
  } | null> {
    const results = await this.findAmenitiesByNames([name], locale);
    if (results.length > 0) {
      return results[0];
    }
    return null;
  }

  // Buscar amenity por ID (para obtener nombre completo)
  async findAmenityById(id: number): Promise<{
    id: number;
    documentId: string;
    Name: string;
  } | null> {
    try {
      const response = await this.fetchWithAuth(
        `/amenities/${id}?fields[0]=id&fields[1]=documentId&fields[2]=Name`
      );
      const data: StrapiResponse<{ id: number; documentId: string; Name: string }> = await response.json();
      return data.data || null;
    } catch (error) {
      return null;
    }
  }

  // Crear amenity si no existe
  async createAmenityIfNotExists(name: string, locale: string = 'en'): Promise<{
    id: number;
    documentId: string;
  }> {
    const existing = await this.findAmenityByName(name, locale);
    if (existing) {
      return existing;
    }

    // Generar slug
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Amenities son localizadas
    const response = await this.fetchWithAuth(`/amenities?locale=${locale}`, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          Name: name,
          slug: slug,
        },
      }),
    });

    const data: StrapiResponse<{ id: number; documentId: string }> = await response.json();

    // Intentar publicar el amenity (tiene draftAndPublish: true)
    try {
      await this.fetchWithAuth(
        `/amenities/${data.data.documentId}/actions/publish?locale=${locale}`,
        { method: 'POST' }
      );
    } catch (error) {
      console.warn(`  ⚠️  No se pudo publicar amenity "${name}" (posiblemente falta de permisos de publish), pero se creó como borrador.`);
    }

    return { id: data.data.id, documentId: data.data.documentId };
  }

  // Buscar unidad por número de vivienda y propiedad (para evitar duplicados)
  async findUnit(housingNumber: string, propertyId: number): Promise<{
    id: number;
    documentId: string;
  } | null> {
    try {
      // Buscar unidad que coincida en housing_number y esté vinculada a la propiedad (por ID)
      const response = await this.fetchWithAuth(
        `/units?filters[housing_number][$eq]=${encodeURIComponent(housingNumber)}&filters[property][id][$eq]=${propertyId}&fields[0]=id&fields[1]=documentId`
      );
      const data: StrapiResponse<Array<{ id: number; documentId: string }>> = await response.json();

      if (data.data && data.data.length > 0) {
        return {
          id: data.data[0].id,
          documentId: data.data[0].documentId,
        };
      }
      return null;
    } catch (error) {
      console.error(`Error buscando unidad "${housingNumber}":`, error);
      return null;
    }
  }

  // Agregar unidad a propiedad (Componente)
  async addUnitToProperty(
    propertyDocumentId: string,
    unitData: UnitToCreate,
    locale: string = 'en'
  ): Promise<void> {
    // 1. Obtener propiedad con sus unidades actuales
    const existingProp = await this.fetchWithAuth(
      `/properties/${propertyDocumentId}?populate[units][populate]=floor&locale=${locale}`
    );
    const propData: StrapiResponse<any> = await existingProp.json();

    if (!propData.data) {
      throw new Error(`Property ${propertyDocumentId} not found`);
    }

    const currentUnits = propData.data.units || [];

    // 2. Verificar duplicados
    const isDuplicate = currentUnits.some((u: any) =>
      String(u.housing_number) === String(unitData.housing_number)
    );

    if (isDuplicate) {
      console.log(`  Unit ${unitData.housing_number} already exists in property ${propertyDocumentId}. Skipping.`);
      return;
    }

    // 3. Sanitizar unidades existentes y agregar nueva
    // Reconstruir objetos solo con campos permitidos para evitar error "Invalid key id" o campos readonly
    const allowedFields = [
      'housing_number', 'bedrooms', 'built_area', 'exterior_area',
      'storage_room', 'garage', 'is_available', 'price', 'bathrooms'
    ];

    const sanitizedUnits = currentUnits.map((u: any) => {
      // IMPORTANTE: NO incluir 'id' para evitar errores 'Invalid key id'.
      // Al omitir el ID, Strapi tratará cada unidad como nueva y reemplazará la lista completa.
      const cleanUnit: any = {};

      allowedFields.forEach(field => {
        if (u[field] !== undefined) cleanUnit[field] = u[field];
      });

      // Tratamiento especial para floor (media)
      if (u.floor) {
        if (typeof u.floor === 'object' && u.floor.id) {
          cleanUnit.floor = u.floor.id;
        } else {
          cleanUnit.floor = u.floor; // Ya es ID o null
        }
      }

      return cleanUnit;
    });

    const updatedUnits = [...sanitizedUnits, unitData];

    // 4. Actualizar propiedad
    const response = await this.fetchWithAuth(
      `/properties/${propData.data.documentId}?locale=${locale}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          data: {
            units: updatedUnits
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to add unit to property: ${errorText}`);
    }
  }

  // Buscar archivo existente por URL o nombre
  async findFileByUrlOrName(urlOrName: string): Promise<number | null> {
    try {
      // Extraer el nombre del archivo de la URL si es una URL
      let searchName: string;
      let isUrl = false;

      if (urlOrName.startsWith('http://') || urlOrName.startsWith('https://')) {
        isUrl = true;
        try {
          const urlPath = new URL(urlOrName).pathname;
          searchName = urlPath.split('/').pop() || '';
        } catch {
          // Si la URL no es válida, usar la URL completa como nombre
          searchName = urlOrName;
        }
      } else {
        searchName = urlOrName;
      }

      if (!searchName) {
        return null;
      }

      // Limpiar el nombre del archivo (remover parámetros de query si los hay)
      const cleanName = searchName.split('?')[0].split('#')[0];

      // Extraer nombre base sin extensión para búsqueda más flexible
      const nameWithoutExt = cleanName.replace(/\.[^/.]+$/, '');

      // Normalizar URL de búsqueda
      let normalizedSearchUrl: string | null = null;
      let searchUrlPath: string | null = null;
      let searchUrlPathname: string | null = null;
      if (isUrl) {
        try {
          const urlObj = new URL(urlOrName);
          normalizedSearchUrl = urlObj.href.split('?')[0].split('#')[0].toLowerCase();
          searchUrlPath = urlObj.pathname.toLowerCase();
          // Extraer solo el pathname sin el dominio (útil para comparar con URLs relativas de Strapi)
          searchUrlPathname = urlObj.pathname;
        } catch {
          // Ignorar errores de parsing
        }
      }

      // ESTRATEGIA 0: Si es URL, buscar directamente por la URL completa (más confiable)
      // Esto es lo que necesitamos cuando las imágenes ya están en Strapi
      if (isUrl && normalizedSearchUrl) {
        try {
          // Función helper para comparar URLs
          const compareUrls = (fileUrl: string): boolean => {
            if (!fileUrl) return false;

            try {
              // Normalizar URL del archivo en Strapi
              let normalizedFileUrl: string;
              if (!fileUrl.startsWith('http')) {
                // Si es URL relativa, construirla completa
                const fullFileUrl = fileUrl.startsWith('/')
                  ? `${this.baseUrl}${fileUrl}`
                  : `${this.baseUrl}/${fileUrl}`;
                normalizedFileUrl = new URL(fullFileUrl).href.split('?')[0].split('#')[0].toLowerCase();
              } else {
                normalizedFileUrl = new URL(fileUrl).href.split('?')[0].split('#')[0].toLowerCase();
              }

              // Comparar URLs normalizadas (exact match)
              if (normalizedFileUrl === normalizedSearchUrl) {
                return true;
              }

              // También comparar solo el pathname (útil si los dominios son diferentes)
              const filePathname = new URL(fileUrl.startsWith('http') ? fileUrl : `${this.baseUrl}${fileUrl.startsWith('/') ? fileUrl : '/' + fileUrl}`).pathname;
              if (searchUrlPathname && filePathname === searchUrlPathname) {
                return true;
              }

              // Comparar pathname en minúsculas
              if (searchUrlPath && filePathname.toLowerCase() === searchUrlPath) {
                return true;
              }

              return false;
            } catch (e) {
              // Si hay error al parsear, comparar strings directamente
              return fileUrl === urlOrName ||
                fileUrl.toLowerCase() === urlOrName.toLowerCase() ||
                (!!searchUrlPathname && fileUrl.includes(searchUrlPathname));
            }
          };

          // Buscar primero en archivos recientes (más rápido)
          let response = await this.fetchWithAuth(
            `/upload/files?pagination[limit]=200&sort=createdAt:desc`
          );
          let responseData: any = await response.json();

          let files: Array<{ id: number; name: string; url: string; hash?: string }> = [];
          if (Array.isArray(responseData)) {
            files = responseData;
          } else if (responseData.data) {
            files = responseData.data;
          }

          // Buscar coincidencia exacta por URL
          const urlMatch = files.find(file => file.url && compareUrls(file.url));

          if (urlMatch) {
            return urlMatch.id;
          }

          // Si no encontramos en los primeros 200, buscar más (pero solo si realmente necesitamos)
          // Esto es más lento, así que lo hacemos solo si no encontramos nada
          if (files.length < 200) {
            // Ya buscamos todos los archivos disponibles
            return null;
          }

          // Buscar en más archivos si es necesario
          response = await this.fetchWithAuth(
            `/upload/files?pagination[limit]=1000&sort=createdAt:desc`
          );
          responseData = await response.json();

          if (Array.isArray(responseData)) {
            files = responseData;
          } else if (responseData.data) {
            files = responseData.data;
          }

          const urlMatchExtended = files.find(file => file.url && compareUrls(file.url));
          if (urlMatchExtended) {
            return urlMatchExtended.id;
          }
        } catch (e) {
          // Continuar con otras estrategias si falla
        }
      }

      // Estrategia 1: Buscar por nombre exacto
      // En Strapi v5, el endpoint puede ser /api/upload/files
      let response = await this.fetchWithAuth(
        `/upload/files?filters[name][$eq]=${encodeURIComponent(cleanName)}`
      );

      let responseData: any = await response.json();

      // Debug: Log temporal para ver la estructura de respuesta
      if (process.env.DEBUG_FILES === 'true') {
        console.log(`  [DEBUG] Buscando: ${cleanName}`);
        console.log(`  [DEBUG] Respuesta API:`, JSON.stringify(responseData).substring(0, 200));
      }

      // En Strapi v5, la respuesta puede venir directamente como array o dentro de data
      let data: StrapiResponse<Array<{ id: number; name: string; url: string; hash?: string }>>;
      if (Array.isArray(responseData)) {
        data = { data: responseData };
      } else if (responseData.data) {
        data = responseData;
      } else {
        data = { data: [] };
      }

      if (process.env.DEBUG_FILES === 'true' && data.data && data.data.length > 0) {
        console.log(`  [DEBUG] Encontrados ${data.data.length} archivo(s) con nombre similar`);
        data.data.slice(0, 3).forEach((f: any) => {
          console.log(`  [DEBUG] - ID: ${f.id}, Name: ${f.name}, URL: ${f.url?.substring(0, 80)}`);
        });
      }

      // Estrategia 2: Si no hay coincidencia exacta, buscar por nombre parcial (contains)
      // Solo si el nombre base es suficientemente largo para evitar falsos positivos
      if ((!data.data || data.data.length === 0) && nameWithoutExt.length > 5) {
        try {
          response = await this.fetchWithAuth(
            `/upload/files?filters[name][$contains]=${encodeURIComponent(nameWithoutExt)}`
          );
          responseData = await response.json();
          if (Array.isArray(responseData)) {
            data = { data: responseData };
          } else if (responseData.data) {
            data = responseData;
          }
        } catch (e) {
          // Ignorar errores en búsqueda parcial
        }
      }

      // Estrategia 3: Si es URL y aún no encontramos nada, buscar en archivos recientes
      // Esto es útil cuando Strapi modifica el nombre del archivo al subirlo
      if (isUrl && normalizedSearchUrl && (!data.data || data.data.length === 0)) {
        try {
          // Buscar más archivos recientes para comparar URLs
          response = await this.fetchWithAuth(
            `/upload/files?pagination[limit]=500&sort=createdAt:desc`
          );
          responseData = await response.json();
          if (Array.isArray(responseData)) {
            data = { data: responseData };
          } else if (responseData.data) {
            data = responseData;
          }
        } catch (e) {
          // Ignorar errores
        }
      }

      // Estrategia 4: Si aún no encontramos nada, buscar por el hash del archivo si está en la URL
      // Algunas URLs de Strapi incluyen un hash al final del nombre
      if (isUrl && (!data.data || data.data.length === 0)) {
        // Extraer posibles hashes del nombre del archivo
        const hashMatch = cleanName.match(/_([a-f0-9]{8,})\./);
        if (hashMatch && hashMatch[1]) {
          try {
            response = await this.fetchWithAuth(
              `/upload/files?filters[hash][$eq]=${hashMatch[1]}`
            );
            responseData = await response.json();
            if (Array.isArray(responseData)) {
              data = { data: responseData };
            } else if (responseData.data) {
              data = responseData;
            }
          } catch (e) {
            // Ignorar errores
          }
        }
      }

      if (data.data && data.data.length > 0) {
        // Extraer hash del nombre de archivo si existe (formato: nombre_hash.ext)
        const hashMatch = cleanName.match(/_([a-f0-9]{8,})\./);
        const fileHash = hashMatch ? hashMatch[1] : null;

        // Si es una URL, buscar coincidencia por URL o nombre
        if (isUrl && normalizedSearchUrl) {
          const matchingFile = data.data.find(file => {
            try {
              // Primero comparar por nombre exacto (más confiable)
              if (file.name === cleanName || file.name.toLowerCase() === cleanName.toLowerCase()) {
                return true;
              }

              // Comparar por hash si está disponible
              if (fileHash && file.hash && file.hash.toLowerCase() === fileHash.toLowerCase()) {
                return true;
              }

              // Comparar si el hash está en el nombre del archivo
              if (fileHash && file.name.toLowerCase().includes(fileHash.toLowerCase())) {
                return true;
              }

              // Comparar nombre base sin extensión
              const fileBaseName = file.name.replace(/\.[^/.]+$/, '').toLowerCase();
              if (fileBaseName === nameWithoutExt.toLowerCase() && nameWithoutExt.length > 5) {
                return true;
              }

              // Construir URL completa del archivo
              let fileUrl: string;
              if (file.url) {
                fileUrl = file.url.startsWith('http')
                  ? file.url
                  : file.url.startsWith('/')
                    ? `${this.baseUrl}${file.url}`
                    : `${this.baseUrl}/${file.url}`;
              } else {
                return false;
              }

              const normalizedFileUrl = new URL(fileUrl).href.split('?')[0].split('#')[0].toLowerCase();

              // Comparar URLs normalizadas (exact match)
              if (normalizedFileUrl === normalizedSearchUrl) {
                return true;
              }

              // Comparar pathname completo
              const fileUrlPath = new URL(fileUrl).pathname.toLowerCase();

              if (searchUrlPath && fileUrlPath === searchUrlPath) {
                return true;
              }

              // Comparar si el pathname termina con el mismo nombre de archivo
              if (searchUrlPath && fileUrlPath.endsWith('/' + cleanName.toLowerCase())) {
                return true;
              }

              // Comparar si el pathname contiene el nombre base (solo si el nombre es suficientemente único)
              if (searchUrlPath && nameWithoutExt.length > 10 && fileUrlPath.includes(nameWithoutExt.toLowerCase())) {
                return true;
              }

              return false;
            } catch (e) {
              // Si hay error al parsear URLs, comparar solo por nombre
              return file.name === cleanName ||
                file.name.toLowerCase() === cleanName.toLowerCase() ||
                (nameWithoutExt.length > 5 && file.name.toLowerCase().includes(nameWithoutExt.toLowerCase()));
            }
          });

          if (matchingFile) {
            return matchingFile.id;
          }
        } else {
          // Si no es URL, retornar el primero que coincida por nombre
          const exactMatch = data.data.find(f => f.name === cleanName || f.name.toLowerCase() === cleanName.toLowerCase());
          if (exactMatch) {
            return exactMatch.id;
          }
          // Si no hay exacto, retornar el primero parcial solo si el nombre base es suficientemente único
          if (nameWithoutExt.length > 5) {
            const partialMatch = data.data.find(f => {
              const fBase = f.name.replace(/\.[^/.]+$/, '').toLowerCase();
              return fBase === nameWithoutExt.toLowerCase();
            });
            if (partialMatch) {
              return partialMatch.id;
            }
          }
        }
      }

      return null;
    } catch (error) {
      // Si hay error al buscar, retornar null (se intentará subir)
      // Log solo en modo verbose para debug
      return null;
    }
  }

  // Subir archivo a Strapi usando native Fetch + FormData
  async uploadFile(file: Buffer, filename: string, mimeType: string): Promise<{ id: number; url?: string; name?: string }> {
    this.ensureToken();

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file)], { type: mimeType });
    formData.append('files', blob, filename);

    const url = `${this.baseUrl}/api/upload`;

    // Usamos fetch directo para evitar que fetchWithAuth agregue 'Content-Type: application/json'
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });

    const responseBody = await response.json();

    if (!response.ok) {
      const errorMessage = (responseBody as any).error?.message ||
        (responseBody as any).message ||
        `HTTP ${response.status}`;
      throw new Error(`Error subiendo archivo (${response.status}): ${errorMessage}`);
    }

    const uploadedFiles: Array<{ id: number; url?: string; name?: string }> = Array.isArray(responseBody)
      ? responseBody
      : [responseBody];

    if (!uploadedFiles || uploadedFiles.length === 0) {
      throw new Error('No se recibió ningún archivo de respuesta');
    }
    return uploadedFiles[0];
  }

  // Agregar unidades a una propiedad
  async addUnitsToProperty(
    propertyDocumentId: string,
    units: Array<UnitToCreate>,
    locale: string = 'en'
  ): Promise<void> {
    const response = await this.fetchWithAuth(
      `/properties/${propertyDocumentId}?locale=${locale}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          data: {
            units,
          },
        }),
      }
    );
    await response.json();
  }
}

export const strapiClient = new StrapiClient();
