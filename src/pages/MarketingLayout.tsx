import { Outlet } from 'react-router-dom';

export default function MarketingLayout() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
