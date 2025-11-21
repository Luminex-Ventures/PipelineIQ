import Signup from './Signup';
import { useNavigate, useParams } from 'react-router-dom';

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  return (
    <Signup
      onToggle={() => navigate('/login')}
      presetToken={token}
    />
  );
}
