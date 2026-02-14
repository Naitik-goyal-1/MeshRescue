import React, { useEffect, useRef } from 'react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    // Dynamic access to the global variable loaded via script tag
    const Html5QrcodeScanner = (window as any).Html5QrcodeScanner;
    
    if (Html5QrcodeScanner) {
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      scannerRef.current = new Html5QrcodeScanner("reader", config, /* verbose= */ false);
      
      scannerRef.current.render(
        (decodedText: string) => {
            onScan(decodedText);
            // Auto close after successful scan to prevent multiple triggers
            if(scannerRef.current) scannerRef.current.clear();
        },
        (error: any) => {
            // Ignore scan errors as they happen every frame no QR is found
        }
      );
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch((error: any) => console.error("Failed to clear scanner", error));
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[60] bg-black bg-opacity-90 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-dark-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-700">
            <div className="p-4 bg-dark-800 flex justify-between items-center">
                <h3 className="text-white font-bold">Scan Peer QR</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white">Close</button>
            </div>
            <div id="reader" className="bg-black w-full min-h-[300px]"></div>
            <div className="p-4 text-center text-sm text-gray-400">
                Point camera at the other device's QR code.
            </div>
        </div>
    </div>
  );
};

export default QRScanner;