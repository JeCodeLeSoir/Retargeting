using System;
using System.Collections.Generic;
using UnityEngine;

public class RetargetProtocol : MonoBehaviour
{
    [SerializeField] private GameObject source;
    [SerializeField] private Avatar avatar;

    [SerializeField]
    private MySkeletonBone[] skeletonBones;
    [SerializeField]
    private MyHumanBone[] humanBones;

    [Serializable]
    public class MySkeletonBone
    {
        public string name;
        //public string parentName;
        public Vector3 position;
        public Quaternion rotation;
        public Vector3 scale;
    }

    [Serializable]
    public class MyHumanBone
    {
        public string boneName;
        public string humanName;
        public HumanLimit limit;
    }

    [Serializable]
    public class BoneData
    {
        public Transform txBoneRef;
        public Transform txBone;
        public RotationRetargetReference rotationRetargetReference;

        public HumanBodyBones human;
        public HumanBodyBones parent;
    }


    public class RotationRetargetReference
    {
        public Quaternion offset;
        public Quaternion offsetInverse;
        public RotationRetargetReference(Quaternion quaternionSource, Quaternion quaternionRef)
        {
            offsetInverse = Quaternion.Inverse(quaternionSource) * quaternionRef;
            offset = Quaternion.Inverse(quaternionRef) * quaternionSource;
        }

        public void ComputInverse(Transform tx_ref, Transform tx_source)
        {
            tx_ref.rotation = tx_source.rotation * offsetInverse;
        }

        public void Comput(Transform tx_ref, Transform tx_source)
        {
            tx_source.rotation = tx_ref.rotation * offset;
        }
    }

    [SerializeField]
    List<BoneData> bones = new List<BoneData>();


    bool init = false;


    public Transform[] TxBonesTraver(Transform bone)
    {
        if (bone == null)
            return new Transform[0];

        List<Transform> result = new List<Transform>();
        Traverse(bone, result);
        return result.ToArray();
    }

    private void Traverse(Transform current, List<Transform> result)
    {
        result.Add(current);

        for (int i = 0; i < current.childCount; i++)
        {
            Traverse(current.GetChild(i), result);
        }
    }

    public Transform Find(Transform bone, string name)
    {
        Transform[] transforms = TxBonesTraver(bone);

        for (int i = 0; i < transforms.Length; i++)
        {
            if (transforms[i].name == name)
                return transforms[i];
        }

        return null;
    }

    void Start()
    {
        HumanDescription humanDescription = avatar.humanDescription;
        skeletonBones = new MySkeletonBone[humanDescription.skeleton.Length];

        for (int i = 0; i < humanDescription.skeleton.Length; i++)
        {
            skeletonBones[i] = new MySkeletonBone
            {
                name = humanDescription.skeleton[i].name,
                //parentName = SkeletonBoneUtils.GetParentName(humanDescription.skeleton[i]),
                position = humanDescription.skeleton[i].position,
                rotation = humanDescription.skeleton[i].rotation,
                scale = humanDescription.skeleton[i].scale
            };
        }

        humanBones = new MyHumanBone[humanDescription.human.Length];
        for (int i = 0; i < humanDescription.human.Length; i++)
        {
            humanBones[i] = new MyHumanBone
            {
                boneName = humanDescription.human[i].boneName,
                humanName = humanDescription.human[i].humanName,
                limit = humanDescription.human[i].limit
            };
        }

        for (int i = 0; i < (int)HumanBodyBones.LastBone; i++)
        {
            HumanBodyBones humanBody = (HumanBodyBones)i;
            MyHumanBone humanBone = Array.Find(humanBones, hb => hb.humanName == humanBody.ToString());

            if (humanBone is not null)
            {
                MySkeletonBone mySkeletonBone = Array.Find(skeletonBones, 
                    hb => hb.name == humanBone.boneName);

                Transform txbone = Find(source.transform, mySkeletonBone.name);
                GameObject boneobj = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                
                boneobj.name = humanBone.humanName;
                boneobj.transform.position = txbone.position;
                boneobj.transform.rotation = Quaternion.identity;
                boneobj.transform.localScale = Vector3.one * 0.1f;

                //Quaternion offset = Quaternion.Inverse(txbone.rotation ) * Quaternion.identity;
                //Quaternion offset = Quaternion.Inverse(Quaternion.identity) * txbone.rotation;

                bones.Add(new BoneData()
                {
                    txBone = txbone,
                    txBoneRef = boneobj.transform,
                    rotationRetargetReference = new RotationRetargetReference(txbone.rotation, boneobj.transform.rotation),
                    human = humanBody,
                    parent = (HumanBodyBones)HumanTrait.GetParentBone(i)
                });
            }
        }

        for (int y = 0; y < bones.Count; y++)
        {
            BoneData a = bones[y];
            for (int x = 0; x < bones.Count; x++)
            {
                BoneData b = bones[x];

                if (a == b)
                    continue;

                if (a.parent == b.human)
                {
                    Debug.Log($"Set parent {a.parent}");
                    a.txBoneRef.SetParent(b.txBoneRef, true);
                    break;
                }
            }
        }

        init = true;
    }

    [SerializeField]
    bool isComputInverse = false;

    void Update()
    {
        if (!init)
            return;

        for (int i = 0; i < bones.Count; i++)
        {
            BoneData boneData = bones[i];

            if(isComputInverse)
                boneData.rotationRetargetReference.ComputInverse(boneData.txBoneRef, boneData.txBone);
            else
                boneData.rotationRetargetReference.Comput(boneData.txBoneRef, boneData.txBone);
        }
    }


}