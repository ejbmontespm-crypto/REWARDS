// Nunca se renderiza de verdad — el botón de este tab en _layout.js
// intercepta el toque y abre /staff-escanear (modal de pantalla completa)
// en vez de navegar aquí. Existe solo porque expo-router exige un archivo
// real para poder registrar el tab.
export default function EscanearTabPlaceholder() {
  return null;
}
