import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PROFILE_KEY = 'requireProfile';
export const RequireProfile = () => SetMetadata(REQUIRE_PROFILE_KEY, true);
