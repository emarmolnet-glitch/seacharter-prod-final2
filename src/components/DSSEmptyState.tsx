import React, { useLayoutEffect, useRef } from "react";

export default function DSSEmptyState() {
  const titleRef = useRef<HTMLElement>(null);
  const subtitleRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    titleRef.current?.style.setProperty("color", "#ffffff", "important");
    subtitleRef.current?.style.setProperty("color", "#d1d5db", "important");
  }, []);

  return (
    <>
      <strong ref={titleRef} className="block text-base text-white font-semibold">
        Esperando datos de ruta
      </strong>
      <span ref={subtitleRef} className="mt-2 block text-gray-300">
        Define POL, POD y cantidad de carga en Mapa o Calculadora para activar Decisiones.
      </span>
    </>
  );
}
