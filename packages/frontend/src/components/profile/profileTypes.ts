export interface ProfileData {
  email: string;
  name: string;
  role: 'user' | 'admin';
  avatarUrl?: string | null;
  createdAt?: string;
  acceptedTermsAt?: string | null;
  isSubscribed?: boolean;
  desiredCategories?: string[];
  lastEmailSent?: string | null;
}

import { CONTENT } from '../../theme/content';
export const ALL_CATEGORIES = [
  ...CONTENT.signup.form.categoryOptions.Tech,
  ...CONTENT.signup.form.categoryOptions['Non-Tech'],
];
