
import { NextResponse } from 'next/server';
import { strapiClient } from '@/lib/strapi-client';
import { parseBoolean } from '@/lib/validators';
import { uploadImageFromUrl } from '@/lib/upload-media';
import type { ExcelUnitRow, UnitToCreate } from '@/lib/types';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { unit, propertyId, propertyDocumentId, propertyTitle } = body;

        let resolvedPropertyDocumentId = propertyDocumentId;

        if (!resolvedPropertyDocumentId && propertyTitle) {
            const prop = await strapiClient.findPropertyByTitle(propertyTitle, 'en');
            if (prop) {
                resolvedPropertyDocumentId = prop.documentId;
            }
        }

        if (!resolvedPropertyDocumentId && propertyId) {
            // Fallback: if we only have numeric ID, we can't easily find it without a new query or check.
            // But Strapi v5 create response returns documentId. The client should pass it.
            // Warning user if missing.
        }

        if (!resolvedPropertyDocumentId) {
            return NextResponse.json({ success: false, error: "Property connection required (provide propertyDocumentId or propertyTitle)" }, { status: 400 });
        }

        // TODO: Validate unit row

        // Upload floor image if exists
        let floorImageId: number | undefined;
        if (unit.floor && String(unit.floor).startsWith('http')) {
            try {
                floorImageId = await uploadImageFromUrl(String(unit.floor)) ?? undefined;
            } catch (e) {
                console.warn(`Failed to upload floor image for unit ${unit.housing_number}`, e);
            }
        }

        const unitData: UnitToCreate = {
            housing_number: String(unit.housing_number || ''),
            bedrooms: String(unit.bedrooms || ''),
            built_area: String(unit.built_area || ''),
            price: String(unit.price || ''),
            storage_room: parseBoolean(unit.storage_room),
            garage: parseBoolean(unit.garage),
            is_available: parseBoolean(unit.is_available),
            bathrooms: parseInt(String(unit.bathrooms || '0')),
            exterior_area: String(unit.exterior_area || ''),
            floor: floorImageId, // Pass ID
            // property: resolvedPropertyId // No longer needed in component data
        };

        await strapiClient.addUnitToProperty(resolvedPropertyDocumentId, unitData);

        return NextResponse.json({
            success: true
        });

    } catch (error) {
        console.error('Import unit error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
