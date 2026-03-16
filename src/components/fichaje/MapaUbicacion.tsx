"use client";

interface MapaUbicacionProps {
  lat: number;
  lng: number;
  label?: string;
}

export default function MapaUbicacion({ lat, lng, label }: MapaUbicacionProps) {
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.003},${lng + 0.005},${lat + 0.003}&layer=mapnik&marker=${lat},${lng}`;
  const linkUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  return (
    <div className="card p-0 overflow-hidden">
      {label && (
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
          <p className="text-sm font-medium text-gray-700">{label}</p>
        </div>
      )}
      <div className="relative w-full h-48">
        <iframe src={mapUrl} className="absolute inset-0 w-full h-full border-0" loading="lazy" title="Ubicación de fichaje" />
      </div>
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
        <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:text-primary-800">
          Ver en mapa completo →
        </a>
      </div>
    </div>
  );
}
