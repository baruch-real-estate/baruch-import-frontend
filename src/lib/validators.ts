// Funciones de validación para datos del CSV

import type { ExcelPropertyRow, ExcelUnitRow } from './types';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// Convertir cualquier valor a string limpio
function safeTrim(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// Convertir string TRUE/FALSE a boolean
export function parseBoolean(value: string | undefined | number): boolean {
  if (value === undefined || value === null || value === '') return false;
  const normalized = String(value).trim().toUpperCase();
  return normalized === 'TRUE' || normalized === '1' || normalized === 'YES';
}

// Validar una fila de propiedad
export function validatePropertyRow(
  row: ExcelPropertyRow,
  rowIndex: number
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Campos requeridos
  if (safeTrim(row.title) === '') {
    errors.push({
      field: 'title',
      message: 'El título es requerido',
    });
  }

  if (safeTrim(row.description) === '') {
    errors.push({
      field: 'description',
      message: 'La descripción es requerida',
    });
  }

  if (safeTrim(row.price) === '') {
    errors.push({
      field: 'price',
      message: 'El precio es requerido',
    });
  } else {
    const price = parseFloat(String(row.price));
    if (isNaN(price) || price < 0) {
      errors.push({
        field: 'price',
        message: `El precio debe ser un número válido (valor: "${row.price}")`,
      });
    }
  }

  if (safeTrim(row.address) === '') {
    errors.push({
      field: 'address',
      message: 'La dirección es requerida',
    });
  }

  if (safeTrim(row.bedrooms) === '') {
    errors.push({
      field: 'bedrooms',
      message: 'El número de habitaciones es requerido',
    });
  } else {
    const bedrooms = parseInt(String(row.bedrooms));
    if (isNaN(bedrooms) || bedrooms < 0) {
      errors.push({
        field: 'bedrooms',
        message: `Las habitaciones deben ser un número válido (valor: "${row.bedrooms}")`,
      });
    }
  }

  if (safeTrim(row.bathrooms) === '') {
    errors.push({
      field: 'bathrooms',
      message: 'El número de baños es requerido',
    });
  } else {
    const bathrooms = parseInt(String(row.bathrooms));
    if (isNaN(bathrooms) || bathrooms < 0) {
      errors.push({
        field: 'bathrooms',
        message: `Los baños deben ser un número válido (valor: "${row.bathrooms}")`,
      });
    }
  }

  if (safeTrim(row.lot_area) === '') {
    errors.push({
      field: 'lot_area',
      message: 'El área del lote es requerida',
    });
  } else {
    const lotArea = parseFloat(String(row.lot_area));
    if (isNaN(lotArea) || lotArea < 0) {
      errors.push({
        field: 'lot_area',
        message: `El área del lote debe ser un número válido (valor: "${row.lot_area}")`,
      });
    }
  }

  if (safeTrim(row.built_area) === '') {
    errors.push({
      field: 'built_area',
      message: 'El área construida es requerida',
    });
  } else {
    const builtArea = parseFloat(String(row.built_area));
    if (isNaN(builtArea) || builtArea < 0) {
      errors.push({
        field: 'built_area',
        message: `El área construida debe ser un número válido (valor: "${row.built_area}")`,
      });
    }
  }

  if (safeTrim(row.main_image) === '') {
    errors.push({
      field: 'main_image',
      message: 'La imagen principal es requerida',
    });
  } else if (!isValidUrl(row.main_image)) {
    errors.push({
      field: 'main_image',
      message: `La URL de la imagen principal no es válida: "${row.main_image}"`,
    });
  }

  // Validaciones opcionales con warnings
  if (row.parking_spaces) {
    const parking = parseInt(String(row.parking_spaces));
    if (isNaN(parking) || parking < 0) {
      warnings.push({
        field: 'parking_spaces',
        message: `El número de espacios de estacionamiento no es válido (valor: "${row.parking_spaces}")`,
      });
    }
  }

  if (row.Map_link && !isValidUrl(row.Map_link)) {
    warnings.push({
      field: 'Map_link',
      message: `La URL del mapa no es válida: "${row.Map_link}"`,
    });
  }

  if (row.gallery) {
    const galleryUrls = String(row.gallery).split(',').map(url => url.trim()).filter(Boolean);
    galleryUrls.forEach((url, idx) => {
      if (!isValidUrl(url)) {
        warnings.push({
          field: `gallery[${idx}]`,
          message: `URL de galería no válida: "${url}"`,
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Validar una fila de unidad
export function validateUnitRow(
  row: ExcelUnitRow,
  rowIndex: number
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (safeTrim(row.housing_number) === '') {
    errors.push({
      field: 'housing_number',
      message: 'El número de vivienda es requerido',
    });
  }

  if (safeTrim(row.bedrooms) === '') {
    errors.push({
      field: 'bedrooms',
      message: 'El número de habitaciones es requerido',
    });
  }

  if (safeTrim(row.built_area) === '') {
    errors.push({
      field: 'built_area',
      message: 'El área construida es requerida',
    });
  }

  if (safeTrim(row.price) === '') {
    errors.push({
      field: 'price',
      message: 'El precio es requerido',
    });
  }

  if (safeTrim(row.bathrooms) === '') {
    errors.push({
      field: 'bathrooms',
      message: 'El número de baños es requerido',
    });
  } else {
    const bathrooms = parseInt(String(row.bathrooms));
    if (isNaN(bathrooms) || bathrooms < 0) {
      errors.push({
        field: 'bathrooms',
        message: `Los baños deben ser un número válido (valor: "${row.bathrooms}")`,
      });
    }
  }

  if (safeTrim(row.exterior_area) !== '') {
    const exteriorArea = parseFloat(String(row.exterior_area));
    if (isNaN(exteriorArea) || exteriorArea < 0) {
      warnings.push({
        field: 'exterior_area',
        message: `El área exterior no es un número válido (valor: "${row.exterior_area}")`,
      });
    }
  }

  if (safeTrim(row.floor) !== '') {
    if (!isValidUrl(String(row.floor))) {
      warnings.push({
        field: 'floor',
        message: `La URL del plano no es válida: "${row.floor}"`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Validar URL
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Generar slug desde título
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9]+/g, '-') // Reemplazar caracteres especiales con guiones
    .replace(/^-+|-+$/g, ''); // Remover guiones al inicio y final
}

