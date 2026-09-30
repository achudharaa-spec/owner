/**
 * baleSlipGenerator.js
 * Generates and prints physical Master Bale Transport & Dispatch Slips
 * for Govindasamy & Co Wholesale Mat Manufacturing.
 */

// Helper to calculate bales if order doesn't have pre-packed bales array
export function packOrderItemsToBales(items = []) {
  const BALE_CAPACITY = 120;
  
  // Flatten bundles
  const bundlesToPack = [];
  items.forEach((item, itemIdx) => {
    const bundlesPerPack = Number(item.bundlesPerPack) > 0 ? Number(item.bundlesPerPack) : 4;
    const bundleSize = Math.max(1, Math.round(BALE_CAPACITY / bundlesPerPack));
    const qty = Number(item.qty) || 1;
    const bundlePieces = Number(item.bundlePieces) || (item.sellingUnit === 'PIECE' ? 1 : 20);

    for (let i = 0; i < qty; i++) {
      bundlesToPack.push({
        itemId: item.id || `item_${itemIdx}`,
        title: item.title || item.name || 'Wholesale Mat',
        bundleSize,
        bundlesPerPack,
        bundlePieces,
        sellingUnit: item.sellingUnit || 'BUNDLE'
      });
    }
  });

  // Sort descending by size (Best-Fit Decreasing)
  bundlesToPack.sort((a, b) => b.bundleSize - a.bundleSize);

  const bales = [];
  bundlesToPack.forEach((bundle) => {
    let bestBale = null;
    let minRemaining = Infinity;

    for (const bale of bales) {
      const remaining = BALE_CAPACITY - bale.currentLoad;
      if (remaining >= bundle.bundleSize && (remaining - bundle.bundleSize) < minRemaining) {
        bestBale = bale;
        minRemaining = remaining - bundle.bundleSize;
      }
    }

    if (bestBale) {
      bestBale.currentLoad += bundle.bundleSize;
      const existing = bestBale.items.find(i => i.title === bundle.title);
      if (existing) {
        existing.bundleQty += 1;
        existing.totalPieces += bundle.bundlePieces;
      } else {
        bestBale.items.push({
          itemId: bundle.itemId,
          title: bundle.title,
          bundleQty: 1,
          bundlePieces: bundle.bundlePieces,
          totalPieces: bundle.bundlePieces,
          bundlesPerPack: bundle.bundlesPerPack,
          capacityPercent: ((bundle.bundleSize / BALE_CAPACITY) * 100).toFixed(1)
        });
      }
    } else {
      const newBaleIndex = bales.length + 1;
      const newBale = {
        baleId: `MB${String(newBaleIndex).padStart(3, '0')}`,
        currentLoad: bundle.bundleSize,
        capacityUnits: BALE_CAPACITY,
        items: [{
          itemId: bundle.itemId,
          title: bundle.title,
          bundleQty: 1,
          bundlePieces: bundle.bundlePieces,
          totalPieces: bundle.bundlePieces,
          bundlesPerPack: bundle.bundlesPerPack,
          capacityPercent: ((bundle.bundleSize / BALE_CAPACITY) * 100).toFixed(1)
        }]
      };
      bales.push(newBale);
    }
  });

  bales.forEach((bale) => {
    bale.capacityPercent = ((bale.currentLoad / BALE_CAPACITY) * 100).toFixed(1);
  });

  return bales;
}

/**
 * Trigger browser print dialog with formatted Master Bale dispatch stickers
 */
export function printBaleSlips(order) {
  if (!order) return;

  const bales = (Array.isArray(order.bales) && order.bales.length > 0)
    ? order.bales
    : packOrderItemsToBales(order.items || []);

  const totalBales = bales.length || 1;
  const orderDate = order.createdAt?.seconds 
    ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');

  const printWindow = window.open('', '_blank', 'width=880,height=1000');
  if (!printWindow) {
    alert('Please allow popups to print bale dispatch labels.');
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Master Bale Slips - Order #${(order.id || '').substring(0, 8).toUpperCase()}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
          
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            padding: 1rem;
          }

          .no-print-bar {
            background: #1e293b;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .btn-print {
            background: #2563eb;
            color: white;
            border: none;
            padding: 8px 18px;
            border-radius: 6px;
            font-weight: 700;
            cursor: pointer;
            font-size: 14px;
          }

          .bale-slip {
            background: white;
            border: 3px solid #0f172a;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 25px;
            page-break-after: always;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          }

          .bale-slip:last-child {
            page-break-after: auto;
          }

          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 14px;
          }

          .company-brand {
            font-size: 20px;
            font-weight: 900;
            letter-spacing: -0.5px;
            color: #0f172a;
            text-transform: uppercase;
          }

          .company-subtitle {
            font-size: 11px;
            color: #475569;
            font-weight: 600;
          }

          .bale-badge {
            background: #0f172a;
            color: white;
            padding: 8px 14px;
            border-radius: 8px;
            text-align: center;
          }

          .bale-badge-num {
            font-size: 22px;
            font-weight: 900;
            line-height: 1;
          }

          .bale-badge-sub {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .consignee-box {
            background: #f1f5f9;
            border: 1.5px solid #cbd5e1;
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 14px;
          }

          .box-label {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #64748b;
            margin-bottom: 4px;
          }

          .consignee-name {
            font-size: 18px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 4px;
          }

          .consignee-details {
            font-size: 12px;
            color: #334155;
            line-height: 1.4;
          }

          .contents-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
          }

          .contents-table th {
            background: #e2e8f0;
            color: #1e293b;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            padding: 8px 10px;
            text-align: left;
            border: 1px solid #cbd5e1;
          }

          .contents-table td {
            font-size: 12px;
            padding: 8px 10px;
            border: 1px solid #e2e8f0;
            color: #0f172a;
          }

          .transport-footer {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
            border-top: 2px dashed #94a3b8;
            padding-top: 12px;
            margin-top: 10px;
          }

          .info-cell {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px;
            font-size: 11px;
          }

          .info-cell strong {
            display: block;
            font-size: 10px;
            color: #64748b;
            text-transform: uppercase;
          }

          .stamp-box {
            border: 2px dashed #dc2626;
            border-radius: 6px;
            padding: 8px;
            text-align: center;
            color: #dc2626;
            font-weight: 800;
            font-size: 11px;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          @media print {
            body {
              background: white;
              padding: 0;
            }
            .no-print-bar {
              display: none !important;
            }
            .bale-slip {
              box-shadow: none;
              border: 2.5px solid black;
              margin-bottom: 0;
              page-break-after: always;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <div>
            <strong>SRI SURYA TEX Dispatch Manager</strong> • ${totalBales} Master Bale Slip(s) Ready
          </div>
          <button class="btn-print" onclick="window.print()">🖨️ Print Dispatch Slips</button>
        </div>

        ${bales.map((bale, idx) => `
          <div class="bale-slip">
            <div class="header-row">
              <div style="display: flex; align-items: center; gap: 12px;">
                <img src="/assets/logo.png" onerror="this.src='/assets/logo.jpg'" style="width: 50px; height: 50px; object-fit: contain;" alt="Logo" />
                <div>
                  <div class="company-brand">SRI SURYA TEX</div>
                  <div class="company-subtitle">Handloom, Rubber & Fancy Mats • Bed Spreads • ERODE - 638 001 • Cell: 98426 86264</div>
                </div>
              </div>
              <div class="bale-badge">
                <div class="bale-badge-num">BALE ${idx + 1} / ${totalBales}</div>
                <div class="bale-badge-sub">MASTER BALE: ${bale.baleId || `MB${String(idx+1).padStart(3,'0')}`}</div>
              </div>
            </div>

            <div class="consignee-box">
              <div class="box-label">Consignee / Destination Wholesale Buyer</div>
              <div class="consignee-name">${order.companyName || 'Wholesale Buyer'}</div>
              <div class="consignee-details">
                <strong>Contact Person:</strong> ${order.contactPerson || 'N/A'} • <strong>Phone:</strong> ${order.phone || 'N/A'}<br>
                ${order.gstNumber && order.gstNumber !== 'N/A' ? `<strong>GSTIN:</strong> ${order.gstNumber}<br>` : ''}
                <strong>Delivery Address:</strong> ${order.deliveryAddress || order.address || 'Standard Delivery'}
              </div>
            </div>

            <table class="contents-table">
              <thead>
                <tr>
                  <th>Item Description</th>
                  <th style="text-align: center;">Bundles Packed</th>
                  <th style="text-align: center;">Total Pieces</th>
                  <th style="text-align: right;">Bale Vol %</th>
                </tr>
              </thead>
              <tbody>
                ${(bale.items || []).map(item => `
                  <tr>
                    <td><strong>${item.title}</strong></td>
                    <td style="text-align: center; font-weight: 700;">${item.bundleQty || 1} Bundle(s)</td>
                    <td style="text-align: center;">${item.totalPieces || (item.bundleQty || 1) * (item.bundlePieces || 1)} pcs</td>
                    <td style="text-align: right; font-weight: 600;">${item.capacityPercent || '-'}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="transport-footer">
              <div class="info-cell">
                <strong>Order Ref & Date</strong>
                #${(order.id || '').substring(0, 10).toUpperCase()} • ${orderDate}
              </div>
              <div class="info-cell">
                <strong>Bale Capacity Utilization</strong>
                ${bale.capacityPercent || '100'}% Capacity Loaded
              </div>
              <div class="stamp-box">
                HANDLE WITH CARE<br>KEEP DRY • HEAVY BALE
              </div>
            </div>
          </div>
        `).join('')}

        <script>
          // Auto trigger print dialog when window finishes loading
          window.addEventListener('load', () => {
            setTimeout(() => {
              window.print();
            }, 400);
          });
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
