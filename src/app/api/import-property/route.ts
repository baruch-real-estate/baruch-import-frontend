
import { NextResponse } from 'next/server';
import { strapiClient } from '@/lib/strapi-client';
import { validatePropertyRow, generateSlug, parseBoolean } from '@/lib/validators';
import { resolveRelations } from '@/lib/resolve-relations';
import { uploadImageFromUrl, uploadMultipleImages } from '@/lib/upload-media';
import { convertTextToBlocks } from '@/lib/convert-to-blocks';
import type { PropertyToCreate } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { property: row, locale = 'en', updateExisting = false } = body;

    // 1. Validar
    const validation = validatePropertyRow(row, 0);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: validation.errors.map(e => e.message).join(', ')
      }, { status: 400 });
    }

    // 2. Resolver Relaciones
    const relations = await resolveRelations({
      category: row.category,
      property_status: row.property_status,
      location: row.location,
      amenities: row.amenities,
      createIfMissing: true,
      locale,
    });

    // 3. Subir Imágenes
    let mainImageId: number | null = null;
    try {
      if (row.main_image) {
        const cleanUrl = String(row.main_image).trim();
        if (cleanUrl) {
          mainImageId = await uploadImageFromUrl(cleanUrl);
        }
      }
    } catch (e) {
      console.error("Error upload main image", e);
      // No fallamos la importación, pero registramos el error
    }

    if (!mainImageId) {
      console.warn(`Warning: Main image missing or failed for "${row.title}"`);
    }

    let galleryIds: number[] = [];
    if (row.gallery) {
      const galleryUrls = String(row.gallery).split(',').map((url: string) => url.trim()).filter(Boolean);
      galleryIds = await uploadMultipleImages(galleryUrls, 100);
    }

    // 4. Preparar Datos
    const slug = generateSlug(row.title);

    console.log(`[Import] Property "${row.title}" - ImportAsDraft: ${body.importAsDraft}`);

    const propertyData: PropertyToCreate = {
      title: String(row.title).trim(),
      description: convertTextToBlocks(row.description),
      price: parseFloat(String(row.price)),
      address: String(row.address).trim(),
      bedrooms: parseInt(String(row.bedrooms)),
      bathrooms: parseInt(String(row.bathrooms)),
      parking_spaces: row.parking_spaces ? parseInt(String(row.parking_spaces)) : undefined,
      lot_area: parseFloat(String(row.lot_area)),
      built_area: parseFloat(String(row.built_area)),
      Map_link: row.Map_link ? String(row.Map_link).trim() : undefined,
      is_private: parseBoolean(row.is_private),
      is_featured: parseBoolean(row.is_featured),
      estimated_completion: row.estimated_completion ? String(row.estimated_completion).trim() : undefined,
      highlight: row.highlight ? String(row.highlight).trim() : undefined,
      main_image: mainImageId,
      gallery: galleryIds,
      slug,
      category: relations.category?.documentId,
      property_status: relations.property_status?.documentId,
      location: relations.location?.documentId,
      amenities: relations.amenities?.map(a => a.documentId),
      publishedAt: body.importAsDraft ? null : undefined, // Explicitly null to enforce draft if supported
    };

    // 5. Crear en Strapi
    const result = await strapiClient.createOrUpdateProperty(
      propertyData,
      locale,
      updateExisting
    );

    // 6. Publicar
    // 6. Publicar o Asegurar Draft
    if (!body.importAsDraft) {
      try {
        await strapiClient.publishProperty(result.documentId, locale);
      } catch (e) {
        console.warn("Failed to publish", e);
      }
    } else {
      // Si se pide Draft, despublicamos explícitamente para asegurar que si ya existía publicada, vuelva a draft
      try {
        await strapiClient.unpublishProperty(result.documentId, locale);
      } catch (e) {
        console.warn("Failed to unpublish (might already be draft)", e);
      }
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      documentId: result.documentId
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
