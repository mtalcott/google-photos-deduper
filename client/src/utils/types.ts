export interface MeResponseType {
  logged_in: boolean;
  user_info: UserInfoType;
  has_active_task: boolean;
}

export interface MeType {
  isLoggedIn: boolean;
  userInfo?: UserInfoType;
  hasActiveTask: boolean;
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

export interface ActiveTaskType {
  status: "PENDING" | "PROGRESS" | "SUCCESS" | "FAILURE";
  meta?: {
    logMessage?: string;
    steps?: {
      [step: string]: {
        startedAt: string;
        completedAt?: string;
        count?: number;
      };
    };
  };
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
  filenameSearchUrl?: URL;
  deletedAt?: string;
  userUrl?: URL;
}
