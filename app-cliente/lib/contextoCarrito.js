import { createContext, useContext, useState, useCallback, useMemo } from "react";

const CarritoContext = createContext(null);

export function useCarrito() {
  const value = useContext(CarritoContext);
  if (!value) throw new Error("useCarrito debe usarse dentro de CarritoProvider");
  return value;
}

let siguienteId = 1;

export function CarritoProvider({ children }) {
  const [items, setItems] = useState([]); // { id, producto_id, nombre, precio_unitario, cantidad, extras: [{id, nombre, costo}] }

  const agregar = useCallback((item) => {
    setItems((prev) => [...prev, { ...item, id: siguienteId++ }]);
  }, []);

  const quitar = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const cambiarCantidad = useCallback((id, cantidad) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, cantidad: Math.max(1, cantidad) } : i)));
  }, []);

  const vaciar = useCallback(() => setItems([]), []);

  const total = useMemo(
    () => items.reduce((suma, i) => suma + i.precio_unitario * i.cantidad, 0),
    [items]
  );

  return (
    <CarritoContext.Provider value={{ items, agregar, quitar, cambiarCantidad, vaciar, total }}>
      {children}
    </CarritoContext.Provider>
  );
}
