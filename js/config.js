const GEO = {
  API_KEY: 'AIzaSyCXaUEBD-iMMLgIBFkrnkm7ovYi97nhUg8',
  loadMap: () => {
    if (!GEO.API_KEY) {
      Utils.showToast('Configura tu API key de Google Maps en js/config.js', 'warning', 6000);
      return null;
    }
    if (window.google && window.google.maps) return Promise.resolve();
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GEO.API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        Utils.showToast('No se pudo cargar Google Maps', 'error');
        resolve();
      };
      document.head.appendChild(script);
    });
  }
};