export interface RanchFriend {
    gid: number;
    name: string;
    avatarUrl: string;
}
export declare function getRanchFriendList(checkpoint?: (completedBatch: boolean) => void): Promise<RanchFriend[]>;
//# sourceMappingURL=friend-roster.d.ts.map