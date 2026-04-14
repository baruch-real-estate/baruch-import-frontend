// Convertir texto plano a formato blocks de Strapi
// El formato debe ser: array de objetos con type: "paragraph" y children que contienen objetos con type: "text" y text

export function convertTextToBlocks(text: any): any[] {
  if (!text || String(text).trim() === '') {
    // Retornar un bloque vacío
    return [
      {
        type: 'paragraph',
        children: [{ type: 'text', text: '' }],
      },
    ];
  }

  // Dividir por saltos de línea (preservando párrafos vacíos entre párrafos con texto)
  const lines = text.split(/\n/);
  const blocks: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '') {
      // Párrafo vacío
      blocks.push({
        type: 'paragraph',
        children: [{ type: 'text', text: '' }],
      });
    } else {
      // Párrafo con texto
      blocks.push({
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: line,
          },
        ],
      });
    }
  }

  // Si no hay bloques, retornar uno vacío
  if (blocks.length === 0) {
    return [
      {
        type: 'paragraph',
        children: [{ type: 'text', text: '' }],
      },
    ];
  }

  return blocks;
}

