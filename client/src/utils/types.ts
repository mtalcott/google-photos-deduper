import {
  HealthCheckMessageType,
  HealthCheckResultMessageType,
  StartDeletionTaskMessageType,
  StartDeletionTaskResultMessageType,
  DeletePhotoMessageType,
  DeletePhotoResultMessageType,
} from "../../../chrome_extension/src/types";

export type {
  HealthCheckMessageType,
  HealthCheckResultMessageType,
  StartDeletionTaskMessageType,
  StartDeletionTaskResultMessageType,
  DeletePhotoMessageType,
  DeletePhotoResultMessageType,
};

export interface MeResponseType {
  logged_in: boolean;
  user_info: UserInfoType;
  has_active_task: boolean;
}

export interface MeType {
  isLoggedIn: boolean;
  userInfo?: UserInfoType;
}

export interface UserInfoType {
  email: string;
  family_name: string;
  given_name: string;
  id: string;
  locale: string;
  name: string;
  picture: string;
  verified_email: boolean;
}

export interface TaskResultsType {
  groups: {
    [groupId: string]: TaskResultsGroupType;
  };
  mediaItems: {
    [mediaItemId: string]: MediaItemType;
  };
  similarityMap: {
    [mediaItemId: string]: {
      [mediaItemId: string]: number;
    };
  };
}

export interface TaskResultsGroupType {
  id: string;
  mediaItemIds: string[];
  originalMediaItemId: string;
  hasDuplicates: boolean;
  isSelected: boolean;
}

export interface MediaItemType {
  id: string;
  filename: string;
  dimensions: string;
  mimeType: string;
  productUrl: URL;
  baseUrl: URL;
  imageUrl: URL;
  size: string;
  deletedAt?: string;
  userUrl?: URL;
  error?: string; // Used for displaying errors on media item cards
}
