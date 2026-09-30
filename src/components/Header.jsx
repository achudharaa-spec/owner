import React from 'react';

export default function Header({
  totalProducts,
  onLogout,
  onOpenBaleInfo,
  activeView = 'CATALOG',
  onNavigateView,
  pendingOrdersCount = 0,
  hidePrices = true,
  onToggleHidePrices
}) {
  return (
    <header className="top-nav">
      <div className="nav-container">
        <div className="brand-group">
          <div className="logo-wrapper">
            <img
              src="/assets/logo.png"
              alt="Sri Surya Tex Logo"
              className="brand-logo"
              onError={(e) => { e.target.src = '/assets/logo.jpg'; }}
            />
          </div>
          <div className="brand-titles">
            <h1>SRI SURYA TEX</h1>
            <span className="brand-tagline">Quality Handloom, Rubber & Fancy Mats &bull; Admin Portal</span>
          </div>
        </div>

        <div className="nav-actions">
          {/* Navigation View Switchers */}
          <button
            type="button"
            className={`admin-status-pill nav-view-tab ${activeView === 'CATALOG' ? 'active-nav-tab' : ''}`}
            onClick={() => onNavigateView && onNavigateView('CATALOG')}
            title="Switch to Catalog & Product Management"
          >
            <i className="fa-solid fa-boxes-stacked"></i>
            <span>Catalog ({totalProducts})</span>
          </button>

          <button
            type="button"
            className={`admin-status-pill nav-view-tab ${activeView === 'ORDERS' ? 'active-nav-tab' : ''}`}
            onClick={() => onNavigateView && onNavigateView('ORDERS')}
            title="Open Wholesale Customer Orders Page"
          >
            <i className="fa-solid fa-file-invoice-dollar" style={{ color: activeView === 'ORDERS' ? '#ffffff' : '#2563eb' }}></i>
            <span>Wholesale Orders</span>
            {pendingOrdersCount > 0 && (
              <span className="nav-pending-badge">{pendingOrdersCount}</span>
            )}
          </button>

          {/* Admin Customer Price Visibility Control */}
          <button
            type="button"
            className="admin-status-pill btn-price-toggle-nav"
            onClick={onToggleHidePrices}
            title={hidePrices ? "Customer Prices are currently HIDDEN. Click to SHOW amounts." : "Customer Prices are currently VISIBLE. Click to HIDE amounts."}
            style={{
              background: hidePrices ? '#fff1f2' : '#f0fdf4',
              borderColor: hidePrices ? '#fecdd3' : '#bbf7d0',
              color: hidePrices ? '#be123c' : '#15803d',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <i className={`fa-solid ${hidePrices ? 'fa-eye-slash' : 'fa-eye'}`} style={{ marginRight: '0.35rem' }}></i>
            <span>User Prices: {hidePrices ? 'HIDDEN' : 'VISIBLE'}</span>
          </button>

          <button
            type="button"
            className="admin-status-pill btn-bale-info-nav"
            onClick={onOpenBaleInfo}
            title="Click to view & edit Common Master Bale Rate"
          >
            <i className="fa-solid fa-cube" style={{ color: 'var(--brand-gold, #c89a4b)' }}></i>
            <span>Bale Info</span>
          </button>

          <div className="admin-status-pill admin-badge-glow">
            <i className="fa-solid fa-shield-halved"></i>
            <span>Admin Active</span>
          </div>

          <button
            type="button"
            className="btn btn-logout-pill"
            onClick={onLogout}
            title="Log Out of Admin Portal"
          >
            <i className="fa-solid fa-arrow-right-from-bracket"></i>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
