using System.Reflection;
using UnityEngine;

public static class SkeletonBoneUtils
{
    private static readonly FieldInfo ParentNameField = typeof(SkeletonBone).GetField(
        "parentName",
        BindingFlags.Instance | BindingFlags.NonPublic
    );

    public static string GetParentName(SkeletonBone bone)
    {
        if (ParentNameField == null)
            return null;

        // SkeletonBone est un struct, il faut le boxer pour GetValue
        return ParentNameField.GetValue(bone) as string;
    }
}