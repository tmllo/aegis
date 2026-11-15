// The May 2024 storm replay (the radiation concept), inside the console frame with console tokens.
import { Link } from 'react-router-dom';
import Radiation from '../concepts/radiation';
import { Icon } from './ui';

export default function ReplayPage() {
  return (
    <div className="cx-replay">
      <Link to="/storm" className="cx-back">
        <Icon name="back" size={18} />
        Storm
      </Link>
      <div data-concept="radiation" className="cx-replay-body">
        <Radiation />
      </div>
    </div>
  );
}
