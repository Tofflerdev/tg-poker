import React, { useState, useEffect } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import { UserProfile } from '../../../types/index';
import { Socket } from 'socket.io-client';

interface ProfileSettingsProps {
  socket: Socket;
  onBack: () => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ socket, onBack }) => {
  const { user, showBackButton, hideBackButton, showAlert } = useTelegram();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    showBackButton(onBack);
    return () => hideBackButton();
  }, [onBack, showBackButton, hideBackButton]);

  useEffect(() => {
    socket.emit('getProfile');

    const onProfileData = (data: UserProfile) => {
      setProfile(data);
      setDisplayName(data.displayName);
      setAvatarUrl(data.avatarUrl || '');
      setIsLoading(false);
    };

    const onProfileUpdated = (data: UserProfile) => {
      setProfile(data);
      setIsSaving(false);
      showAlert('Profile updated successfully!');
    };

    const onProfileError = (msg: string) => {
      setIsSaving(false);
      showAlert(msg);
    };

    socket.on('profileData', onProfileData);
    socket.on('profileUpdated', onProfileUpdated);
    socket.on('profileError', onProfileError);

    return () => {
      socket.off('profileData', onProfileData);
      socket.off('profileUpdated', onProfileUpdated);
      socket.off('profileError', onProfileError);
    };
  }, [socket, showAlert]);

  const handleSave = () => {
    if (displayName.length < 2 || displayName.length > 20) {
      showAlert('Name must be between 2 and 20 characters');
      return;
    }
    setIsSaving(true);
    socket.emit('updateProfile', { displayName, avatarUrl });
  };

  if (isLoading) {
    return <div className="loading-spinner">Loading profile...</div>;
  }

  return (
    <div className="profile-settings page-container">
      <h2>Profile Settings</h2>
      
      <div className="profile-card">
        <div className="avatar-section">
          <img 
            src={avatarUrl || user?.photoUrl || 'https://via.placeholder.com/100'} 
            alt="Avatar" 
            className="profile-avatar"
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/100'; }}
          />
        </div>

        <div className="form-group">
          <label>Display Name</label>
          <input 
            type="text" 
            value={displayName} 
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
          />
        </div>

        <div className="form-group">
          <label>Avatar URL (optional)</label>
          <input 
            type="text" 
            value={avatarUrl} 
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/image.png"
          />
        </div>

        <button 
          className="save-btn" 
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="stats-card">
        <h3>Statistics</h3>
        <div className="stat-row">
          <span>Hands Played:</span>
          <span>{profile?.handsPlayed || 0}</span>
        </div>
        <div className="stat-row">
          <span>Hands Won:</span>
          <span>{profile?.handsWon || 0}</span>
        </div>
        <div className="stat-row">
          <span>Total Winnings:</span>
          <span>{profile?.totalWinnings || 0}</span>
        </div>
        <div className="stat-row">
          <span>Biggest Pot:</span>
          <span>{profile?.biggestPot || 0}</span>
        </div>
        <div className="stat-row">
          <span>Joined:</span>
          <span>{profile?.joinedAt ? new Date(profile.joinedAt).toLocaleDateString() : '-'}</span>
        </div>
      </div>

      <style>{`
        .profile-settings {
          padding: 20px;
          color: var(--tg-theme-text-color, #fff);
        }
        .profile-card, .stats-card {
          background: var(--tg-theme-secondary-bg-color, #2c2c2c);
          padding: 15px;
          border-radius: 12px;
          margin-bottom: 20px;
        }
        .avatar-section {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }
        .profile-avatar {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid var(--tg-theme-button-color, #2481cc);
        }
        .form-group {
          margin-bottom: 15px;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-size: 14px;
          color: var(--tg-theme-hint-color, #aaa);
        }
        .form-group input {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #444;
          background: var(--tg-theme-bg-color, #1c1c1c);
          color: var(--tg-theme-text-color, #fff);
        }
        .save-btn {
          width: 100%;
          padding: 12px;
          background: var(--tg-theme-button-color, #2481cc);
          color: var(--tg-theme-button-text-color, #fff);
          border: none;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
        }
        .save-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .stat-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #444;
        }
        .stat-row:last-child {
          border-bottom: none;
        }
      `}</style>
    </div>
  );
};
