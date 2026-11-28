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
            var q = tx_source.rotation * offsetInverse;
            tx_ref.rotation = q;
        }

        public void Comput(Transform tx_ref, Transform tx_source)
        {
            var q = tx_ref.rotation * offset;
            tx_source.rotation = q;
        }
    }

    [SerializeField]
    public List<BoneData> bones = new List<BoneData>();


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

    Animator animator;

    void Start()
    {
        animator = GetComponent<Animator>();
        if (animator)
            animator.enabled = false;

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
                    //Debug.Log($"Set parent {a.parent}");
                    a.txBoneRef.SetParent(b.txBoneRef, true);
                    break;
                }
            }
        }

        Data2 _base = new Data2();

        _base.datas = new List<Data>();
        /*_base.data3s = new List<Data3>();
        _base.data4s = new List<Data4>();

        for (int i = 0; i < (int)HumanBodyBones.LastBone; i++)
        {
            HumanBodyBones p = (HumanBodyBones)HumanTrait.GetParentBone(i);

            _base.data4s.Add(new Data4()
            {
                humanName = Enum.GetName(typeof(HumanBodyBones), (HumanBodyBones)i),
                humanID = i
            });

            _base.data3s.Add(new Data3()
            {
                humanName = (HumanBodyBones)i,
                parentHumanName = p
            });
        }*/


        for (int y = 0; y < bones.Count; y++)
        {
            BoneData a = bones[y];
            _base.datas.Add(new Data()
            {
                boneName = a.txBone.name,
                humanName = Enum.GetName(typeof(HumanBodyBones), a.human),
                parentHumanName = Enum.GetName(typeof(HumanBodyBones), a.parent)
            });
        }

        for (int y = 0; y < bones.Count; y++)
        {
            BoneData a = bones[y];
            if (a.human == HumanBodyBones.Hips)
            {
                hipsRef = a.txBoneRef;
                a.txBoneRef.SetParent(source.transform, true);
                break;
            }
        }

        // Debug.Log(JsonUtility.ToJson(_base));

        init = true;
        if (animator)
            animator.enabled = true;
    }

    public Transform hipsRef;

    [Serializable]
    public class Data4
    {
        public string humanName;
        public int humanID;
    }

    [Serializable]
    public class Data3
    {
        public HumanBodyBones humanName;
        public HumanBodyBones parentHumanName;
    }

    [Serializable]
    public class Data2
    {
        public List<Data> datas;
        //public List<Data3> data3s;
        //public List<Data4> data4s;
    }

    //{ humanName, boneName, parentHumanName? }
    [Serializable]
    public class Data
    {
        public string humanName;
        public string boneName;
        public string parentHumanName;
    }

    [SerializeField]
    public bool isComputInverse = false;

    public float forwardAngle = 0;

    public Quaternion forwardAngleQuat
    {
        get
        {
            return Quaternion.Euler(0, forwardAngle, 0);
        }
    }

    void Update()
    {
        if (!init)
            return;

        //hipsRef.rotation = Quaternion.Inverse(forwardAngleQuat);


        for (int i = 0; i < bones.Count; i++)
        {
            BoneData boneData = bones[i];

            if (boneData.human == HumanBodyBones.Hips)
            {
                if (isComputInverse)
                    boneData.txBoneRef.localPosition = boneData.txBone.localPosition;
                else
                    boneData.txBone.localPosition = boneData.txBoneRef.localPosition;
            }

            if (isComputInverse)
                boneData.rotationRetargetReference.ComputInverse(boneData.txBoneRef, boneData.txBone);
            else
                boneData.rotationRetargetReference.Comput(boneData.txBoneRef, boneData.txBone);
        }
    }

    private void OnDrawGizmos()
    {
        Debug.DrawRay(transform.position, (forwardAngleQuat * Vector3.forward) * 0.5f, Color.red);
    }

}