using UnityEngine;

public class RetargetAnim : MonoBehaviour
{
    [SerializeField] private RetargetProtocol source;
    [SerializeField] private RetargetProtocol target;

    bool init = false;
    void Start()
    {
        source.isComputInverse = true;
        target.isComputInverse = false;

        offset = target.transform.localPosition - source.transform.localPosition;

        init = true;
    }

    Vector3 offset;

    void Update()
    {
        if (!init)
            return;

        target.transform.localPosition = offset + source.transform.localPosition;

        Quaternion forwardCorrection = Quaternion.Inverse(target.forwardAngleQuat) * source.forwardAngleQuat;
        Quaternion inverseForwardCorrection = Quaternion.Inverse(forwardCorrection);

        foreach (var a in source.bones)
        {
            foreach (var b in target.bones)
            {
                if (a.human == b.human)
                {
                    if (a.human == HumanBodyBones.Hips)
                    {
                        b.txBoneRef.localPosition = a.txBoneRef.localPosition;
                    }

                    b.txBoneRef.localRotation =
                        forwardCorrection
                        * a.txBoneRef.localRotation
                        * inverseForwardCorrection;

                    break;
                }
            }
        }
    }
}
